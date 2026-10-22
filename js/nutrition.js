// Pure nutrition math – no DOM access, unit-testable with `node --test`.

export const NUTRIENTS = Object.freeze(['kcal', 'protein', 'carbs', 'fat']);

/** Energy per gram of macro, used for percent-based targets and sanity checks. */
export const KCAL_PER_GRAM = Object.freeze({ protein: 4, carbs: 4, fat: 9 });

export function zero() {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
}

export function add(a, b) {
  const out = zero();
  for (const k of NUTRIENTS) out[k] = (a[k] || 0) + (b[k] || 0);
  return out;
}

export function sub(a, b) {
  const out = zero();
  for (const k of NUTRIENTS) out[k] = (a[k] || 0) - (b[k] || 0);
  return out;
}

export function scale(a, factor) {
  const out = zero();
  for (const k of NUTRIENTS) out[k] = (a[k] || 0) * factor;
  return out;
}

export function clampMin0(a) {
  const out = zero();
  for (const k of NUTRIENTS) out[k] = Math.max(0, a[k] || 0);
  return out;
}

export function sumNutrition(list) {
  return list.reduce((acc, n) => add(acc, n), zero());
}

/** Nutrient values for exactly 1 unit (1 g, 1 ml or 1 pc) of the ingredient. */
export function perUnit(ingredient) {
  const out = zero();
  const per = ingredient.per || 1;
  for (const k of NUTRIENTS) out[k] = (ingredient[k] || 0) / per;
  return out;
}

/** Nutrient values for a given amount of an ingredient (amount expressed in its `unit`). */
export function ingredientNutrition(ingredient, amount) {
  return scale(perUnit(ingredient), amount);
}

/** Remove floating point noise (e.g. 0.30000000000000004 -> 0.3). */
export function clean(x, decimals = 6) {
  return Number(Number(x).toFixed(decimals));
}

export function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

/** Round to the nearest multiple of `step`, then clamp into [min, max]. */
export function roundToStep(x, step, min = -Infinity, max = Infinity) {
  const rounded = step > 0 ? Math.round(x / step) * step : x;
  return clean(clamp(rounded, min, max));
}

/** Percentage deviation of `actual` from `target` per nutrient (target 0 -> 0 or Infinity). */
export function deviationPercent(actual, target) {
  const out = zero();
  for (const k of NUTRIENTS) {
    const t = target[k] || 0;
    const a = actual[k] || 0;
    out[k] = t === 0 ? (a === 0 ? 0 : Infinity) : ((a - t) / t) * 100;
  }
  return out;
}

/** kcal computed from macros (defaults to 4/4/9). */
export function kcalFromMacros(n, kcalPerGram = KCAL_PER_GRAM) {
  const kpg = { ...KCAL_PER_GRAM, ...kcalPerGram };
  return (
    (n.protein || 0) * kpg.protein +
    (n.carbs || 0) * kpg.carbs +
    (n.fat || 0) * kpg.fat
  );
}

/**
 * Convert macro targets given as percentage of total kcal into grams.
 * @param {{ kcal: number, protein: number, carbs: number, fat: number }} pctTargets
 * @param {{ protein?: number, carbs?: number, fat?: number }} [kcalPerGram=KCAL_PER_GRAM]
 * @returns {{ kcal: number, protein: number, carbs: number, fat: number }}
 */
export function macrosPercentToGrams(pctTargets, kcalPerGram = KCAL_PER_GRAM) {
  const kpg = { ...KCAL_PER_GRAM, ...kcalPerGram };
  const kcal = Number(pctTargets.kcal) || 0;
  return {
    kcal,
    protein: clean(((kcal * (Number(pctTargets.protein) || 0)) / 100) / kpg.protein, 2),
    carbs: clean(((kcal * (Number(pctTargets.carbs) || 0)) / 100) / kpg.carbs, 2),
    fat: clean(((kcal * (Number(pctTargets.fat) || 0)) / 100) / kpg.fat, 2),
  };
}

/**
 * Convert macro targets in grams into percentage of total kcal.
 * @param {{ kcal: number, protein: number, carbs: number, fat: number }} gramTargets
 * @param {{ protein?: number, carbs?: number, fat?: number }} [kcalPerGram=KCAL_PER_GRAM]
 * @returns {{ kcal: number, protein: number, carbs: number, fat: number }}
 */
export function macrosGramsToPercent(gramTargets, kcalPerGram = KCAL_PER_GRAM) {
  const kpg = { ...KCAL_PER_GRAM, ...kcalPerGram };
  const kcal = Number(gramTargets.kcal) || 0;
  if (kcal <= 0) return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  return {
    kcal,
    protein: clean((((Number(gramTargets.protein) || 0) * kpg.protein) / kcal) * 100, 1),
    carbs: clean((((Number(gramTargets.carbs) || 0) * kpg.carbs) / kcal) * 100, 1),
    fat: clean((((Number(gramTargets.fat) || 0) * kpg.fat) / kcal) * 100, 1),
  };
}


