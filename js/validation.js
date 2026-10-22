// Lightweight schema validation for config and recipe JSON – pure, no DOM.

import { NUTRIENTS, KCAL_PER_GRAM, kcalFromMacros, macrosPercentToGrams, clean } from './nutrition.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isNonNegNum = (v) => isNum(v) && v >= 0;

function parseMacroValue(v) {
  if (isNonNegNum(v)) return { value: v, isPercentString: false };
  if (typeof v === 'string' && v.trim().endsWith('%')) {
    const num = Number(v.trim().slice(0, -1));
    if (isNonNegNum(num)) return { value: num, isPercentString: true };
  }
  return null;
}

const DEFAULT_TOLERANCE = { kcal: 3, protein: 5, carbs: 5, fat: 5 };

/**
 * Validates and normalises config. Percentage macro targets are converted to grams
 * so that all downstream calculations and the daily view always use grams.
 * @returns {{ config: object|null, errors: string[], warnings: string[] }}
 */
export function validateConfig(raw) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object') return { config: null, errors: ['config.json: not an object'], warnings };

  const t = raw.targets || {};
  if (!isNonNegNum(t.kcal)) errors.push('config.json: targets.kcal must be a number ≥ 0');

  const parsedMacros = {};
  for (const k of ['protein', 'carbs', 'fat']) {
    const p = parseMacroValue(t[k]);
    if (!p) errors.push(`config.json: targets.${k} must be a number ≥ 0 (or percentage string like "30%")`);
    else parsedMacros[k] = p;
  }

  const rawMode = raw.macroMode ?? (Object.values(parsedMacros).some((m) => m.isPercentString) ? 'percentage' : 'grams');
  if (!['grams', 'percent', 'percentage'].includes(rawMode)) {
    errors.push('config.json: macroMode must be "grams" or "percentage"');
  }
  const macroMode = rawMode === 'percent' || rawMode === 'percentage' ? 'percentage' : 'grams';

  const kcalPerGram = { ...KCAL_PER_GRAM };
  if (raw.kcalPerGram != null) {
    if (typeof raw.kcalPerGram !== 'object') {
      errors.push('config.json: kcalPerGram must be an object');
    } else {
      for (const k of ['protein', 'carbs', 'fat']) {
        if (raw.kcalPerGram[k] == null) continue;
        if (!isNum(raw.kcalPerGram[k]) || raw.kcalPerGram[k] <= 0) {
          errors.push(`config.json: kcalPerGram.${k} must be a number > 0`);
        } else {
          kcalPerGram[k] = raw.kcalPerGram[k];
        }
      }
    }
  }

  const rawUnits = raw.fixedMealUnits ?? raw.units;
  const fixedMealUnits = Array.isArray(rawUnits) && rawUnits.length > 0
    ? rawUnits.map(String).map((s) => s.trim()).filter(Boolean)
    : ['g', 'ml'];

  const planned = raw.plannedMealsPerDay ?? 4;
  if (!Number.isInteger(planned) || planned < 1) errors.push('config.json: plannedMealsPerDay must be an integer ≥ 1');

  const solver = raw.solver || {};
  const mode = solver.mode ?? 'optimize';
  if (!['optimize', 'scale'].includes(mode)) errors.push('config.json: solver.mode must be "optimize" or "scale"');
  for (const [k, v] of Object.entries(solver.weights || {})) {
    if (!NUTRIENTS.includes(k)) warnings.push(`config.json: unknown solver weight "${k}" ignored`);
    else if (!isNonNegNum(v)) errors.push(`config.json: solver.weights.${k} must be a number ≥ 0`);
  }
  if (solver.ratioPreservation != null && !isNonNegNum(solver.ratioPreservation)) {
    errors.push('config.json: solver.ratioPreservation must be a number ≥ 0');
  }

  if (errors.length) return { config: null, errors, warnings };

  const rawTargets = {
    kcal: t.kcal,
    protein: parsedMacros.protein.value,
    carbs: parsedMacros.carbs.value,
    fat: parsedMacros.fat.value,
  };

  let targets;
  if (macroMode === 'percentage') {
    const allPct = ['protein', 'carbs', 'fat'].every((k) => raw.macroMode != null || parsedMacros[k].isPercentString);
    if (allPct) {
      const sum = rawTargets.protein + rawTargets.carbs + rawTargets.fat;
      if (Math.abs(sum - 100) > 0.5) warnings.push(`config.json: macro percentages sum to ${sum}%, expected 100%`);
      targets = macrosPercentToGrams(rawTargets, kcalPerGram);
    } else {
      // Mixed per-field percentage strings and gram numbers
      targets = { kcal: t.kcal };
      for (const k of ['protein', 'carbs', 'fat']) {
        targets[k] = parsedMacros[k].isPercentString
          ? clean(((t.kcal * parsedMacros[k].value) / 100) / kcalPerGram[k], 2)
          : parsedMacros[k].value;
      }
    }
  } else {
    targets = { ...rawTargets };
    const macroKcal = kcalFromMacros(targets, kcalPerGram);
    if (t.kcal > 0 && Math.abs(macroKcal - t.kcal) / t.kcal > 0.1) {
      warnings.push(
        `config.json: macros give ${Math.round(macroKcal)} kcal but kcal target is ${t.kcal} – targets cannot all be met`
      );
    }
  }

  return {
    config: {
      targets,
      rawTargets,
      macroMode,
      kcalPerGram,
      fixedMealUnits: fixedMealUnits.length > 0 ? fixedMealUnits : ['g', 'ml'],
      plannedMealsPerDay: planned,
      tolerance: { ...DEFAULT_TOLERANCE, ...(raw.tolerance || {}) },
      solver: {
        mode,
        weights: { kcal: 1, protein: 2, carbs: 1, fat: 1, ...(solver.weights || {}) },
        ratioPreservation: solver.ratioPreservation ?? 0.3,
      },
    },
    errors,
    warnings,
  };
}

/**
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateRecipe(r, file = 'recipe') {
  const errors = [];
  const warnings = [];
  if (!r || typeof r !== 'object') return { errors: [`${file}: not an object`], warnings };
  if (typeof r.id !== 'string' || !r.id) errors.push(`${file}: "id" is required`);
  if (typeof r.name !== 'string' || !r.name) errors.push(`${file}: "name" is required`);
  if (r.tags != null && !Array.isArray(r.tags)) errors.push(`${file}: "tags" must be an array`);
  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) {
    errors.push(`${file}: "ingredients" must be a non-empty array`);
    return { errors, warnings };
  }

  const seen = new Set();
  r.ingredients.forEach((ing, i) => {
    const where = `${file} › ingredient[${i}]${ing && ing.id ? ` (${ing.id})` : ''}`;
    if (!ing || typeof ing !== 'object') return errors.push(`${where}: not an object`);
    if (typeof ing.id !== 'string' || !ing.id) errors.push(`${where}: "id" is required`);
    else if (seen.has(ing.id)) errors.push(`${where}: duplicate ingredient id`);
    else seen.add(ing.id);
    if (typeof ing.name !== 'string' || !ing.name) errors.push(`${where}: "name" is required`);
    if (typeof ing.unit !== 'string' || !ing.unit) errors.push(`${where}: "unit" is required`);
    if (!isNonNegNum(ing.amount)) errors.push(`${where}: "amount" must be a number ≥ 0`);
    if (!isNum(ing.per) || ing.per <= 0) errors.push(`${where}: "per" must be a number > 0`);
    for (const k of NUTRIENTS) {
      if (!isNonNegNum(ing[k])) errors.push(`${where}: "${k}" must be a number ≥ 0`);
    }
    if (ing.adjust !== false && ing.adjust != null) {
      const a = ing.adjust;
      if (typeof a !== 'object') errors.push(`${where}: "adjust" must be an object or false`);
      else {
        for (const key of ['min', 'max', 'step']) {
          if (a[key] != null && !isNonNegNum(a[key])) errors.push(`${where}: adjust.${key} must be a number ≥ 0`);
        }
        const min = a.min ?? 0;
        const max = a.max ?? Infinity;
        if (min > max) errors.push(`${where}: adjust.min > adjust.max`);
        else if (isNum(ing.amount) && (ing.amount < min || ing.amount > max)) {
          errors.push(`${where}: amount must be within adjust.min..adjust.max`);
        }
      }
    }
    // Sanity check stated kcal vs 4/4/9. Fibre counts as carbs but has few kcal,
    // so the estimate may legitimately be higher – only warn on big mismatches.
    if (NUTRIENTS.every((k) => isNonNegNum(ing[k])) && ing.kcal > 20) {
      const est = kcalFromMacros(ing);
      const ratio = est / ing.kcal;
      if (ratio < 0.75 || ratio > 1.6) {
        warnings.push(`${where}: kcal ${ing.kcal} differs from macros estimate ${Math.round(est)}`);
      }
    }
  });

  return { errors, warnings };
}
