// Day state store: persistence in localStorage + pub/sub + derived plan.
// Recipes are never modified – overrides live in the day state only.

import { planDay } from './planner.js';
import { macrosPercentToGrams, clean } from './nutrition.js';

export const KEY_PREFIX = 'slimbelly:day:';
const KEEP_DAYS = 30;

/** Local date as YYYY-MM-DD. */
export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function newId() {
  return 'm_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

function emptyDay(date) {
  return { date, meals: [], targetOverride: null };
}

function sanitizeTargetOverride(raw, kcalPerGram) {
  if (!raw || typeof raw !== 'object' || !raw.rawTargets || typeof raw.rawTargets !== 'object') return null;
  const macroMode = raw.macroMode === 'percentage' || raw.macroMode === 'percent' ? 'percentage' : 'grams';
  const rt = {
    kcal: Math.max(0, Number(raw.rawTargets.kcal) || 0),
    protein: Math.max(0, Number(raw.rawTargets.protein) || 0),
    carbs: Math.max(0, Number(raw.rawTargets.carbs) || 0),
    fat: Math.max(0, Number(raw.rawTargets.fat) || 0),
  };
  const targets = macroMode === 'percentage' ? macrosPercentToGrams(rt, kcalPerGram) : { ...rt };
  return { macroMode, rawTargets: rt, targets };
}

function sanitizeMeal(m, recipesById) {
  if (!m || typeof m !== 'object') return null;
  const instanceId = typeof m.instanceId === 'string' ? m.instanceId : newId();
  if (m.type === 'fixed') {
    const n = m.nutrition || {};
    const amount = Number(m.amount) > 0 ? Number(m.amount) : null;
    const unit = typeof m.unit === 'string' && m.unit.trim() ? m.unit.trim() : null;
    const p = m.per100 && typeof m.per100 === 'object' ? m.per100 : null;
    return {
      instanceId,
      type: 'fixed',
      name: typeof m.name === 'string' && m.name.trim() ? m.name.trim() : 'Fixed meal',
      amount,
      unit,
      per100: p
        ? {
            kcal: Math.max(0, Number(p.kcal) || 0),
            protein: Math.max(0, Number(p.protein) || 0),
            carbs: Math.max(0, Number(p.carbs) || 0),
            fat: Math.max(0, Number(p.fat) || 0),
          }
        : null,
      nutrition: {
        kcal: Math.max(0, Number(n.kcal) || 0),
        protein: Math.max(0, Number(n.protein) || 0),
        carbs: Math.max(0, Number(n.carbs) || 0),
        fat: Math.max(0, Number(n.fat) || 0),
      },
    };
  }
  if (typeof m.recipeId !== 'string') return null;
  const rawOverrides = m.overrides && typeof m.overrides === 'object' ? m.overrides : {};
  const recipe = recipesById?.get(m.recipeId);
  const overrides = {};
  for (const [ingId, val] of Object.entries(rawOverrides)) {
    const num = Number(val);
    if (!Number.isFinite(num)) continue;
    const clamped = Math.max(0, num);
    const ing = recipe?.ingredients?.find((i) => i.id === ingId);
    if (ing && Math.abs(clamped - ing.amount) < 1e-6) continue;
    overrides[ingId] = clamped;
  }
  return {
    instanceId,
    type: 'prepared',
    recipeId: m.recipeId,
    weight: Number(m.weight) > 0 ? Number(m.weight) : 1,
    locked: !!m.locked,
    frozenAmounts: m.frozenAmounts && typeof m.frozenAmounts === 'object' ? m.frozenAmounts : null,
    overrides,
  };
}

function sanitizeDay(raw, date, kcalPerGram, recipesById) {
  if (!raw || !Array.isArray(raw.meals)) return emptyDay(date);
  return {
    date,
    targetOverride: sanitizeTargetOverride(raw.targetOverride, kcalPerGram),
    meals: raw.meals.map((m) => sanitizeMeal(m, recipesById)).filter(Boolean),
  };
}

/**
 * @param {object} opts
 * @param {Map<string, object>} opts.recipesById
 * @param {object} opts.config
 * @param {Storage} [opts.storage=localStorage]
 * @param {() => Date} [opts.now]
 */
export function createStore({ recipesById, config, storage = globalThis.localStorage, now = () => new Date() }) {
  const listeners = new Set();
  let day = load(dateKey(now()));
  const effectiveConfig = () =>
    day.targetOverride
      ? {
          ...config,
          targets: day.targetOverride.targets,
          rawTargets: day.targetOverride.rawTargets,
          macroMode: day.targetOverride.macroMode,
          hasTargetOverride: true,
        }
      : { ...config, rawTargets: config.rawTargets || config.targets, hasTargetOverride: false };
  let plan = planDay(day, recipesById, effectiveConfig());
  cleanup();

  function load(date) {
    try {
      const raw = storage?.getItem(KEY_PREFIX + date);
      return sanitizeDay(raw ? JSON.parse(raw) : null, date, config.kcalPerGram, recipesById);
    } catch {
      return emptyDay(date);
    }
  }

  function save() {
    try {
      storage?.setItem(KEY_PREFIX + day.date, JSON.stringify(day));
    } catch (e) {
      console.warn('Could not persist day state', e);
    }
  }

  function cleanup() {
    if (!storage) return;
    const cutoff = new Date(now());
    cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
    const cutoffKey = dateKey(cutoff);
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key && key.startsWith(KEY_PREFIX) && key.slice(KEY_PREFIX.length) < cutoffKey) storage.removeItem(key);
    }
  }

  function commit() {
    save();
    plan = planDay(day, recipesById, effectiveConfig());
    listeners.forEach((fn) => fn(plan, day));
  }

  function find(instanceId) {
    const meal = day.meals.find((m) => m.instanceId === instanceId);
    if (!meal) throw new Error(`Unknown meal ${instanceId}`);
    return meal;
  }

  function currentAmounts(instanceId) {
    const mp = plan.meals.find((m) => m.meal.instanceId === instanceId);
    if (!mp || mp.missing) return {};
    return Object.fromEntries(mp.solution.items.map((it) => [it.ingredient.id, it.amount]));
  }

  return {
    getDay: () => day,
    getPlan: () => plan,
    getConfig: effectiveConfig,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Set daily target in either 'grams' or 'percentage' mode (daily view always uses converted grams). */
    setTargets({ macroMode, rawTargets }) {
      day.targetOverride = sanitizeTargetOverride({ macroMode, rawTargets }, config.kcalPerGram);
      commit();
    },

    /** Revert daily target back to config.json values. */
    resetTargets() {
      day.targetOverride = null;
      commit();
    },

    addMeal(recipeId) {
      const meal = {
        instanceId: newId(),
        type: 'prepared',
        recipeId,
        weight: 1,
        locked: false,
        frozenAmounts: null,
        overrides: {},
      };
      day.meals.push(meal);
      commit();
      return meal.instanceId;
    },

    /** Add a fixed/ready meal (e.g. coffee, snack) whose nutrition is calculated from amount and per-100 values. */
    addFixedMeal({ name, amount = null, unit = null, per100 = null, kcal = 0, protein = 0, carbs = 0, fat = 0 }) {
      const meal = sanitizeMeal({
        instanceId: newId(),
        type: 'fixed',
        name,
        amount,
        unit,
        per100,
        nutrition: { kcal, protein, carbs, fat },
      });
      day.meals.push(meal);
      commit();
      return meal.instanceId;
    },

    setFixedMealAmount(instanceId, newAmount) {
      const meal = find(instanceId);
      if (meal.type !== 'fixed') return;
      const amt = Math.max(0, Number(newAmount) || 0);
      meal.amount = amt;
      if (meal.per100) {
        const factor = amt / 100;
        meal.nutrition = {
          kcal: Math.round(meal.per100.kcal * factor),
          protein: clean(meal.per100.protein * factor, 1),
          carbs: clean(meal.per100.carbs * factor, 1),
          fat: clean(meal.per100.fat * factor, 1),
        };
      }
      commit();
    },

    removeMeal(instanceId) {
      day.meals = day.meals.filter((m) => m.instanceId !== instanceId);
      commit();
    },

    /** Move by array index (used by drag & drop). */
    moveMeal(from, to) {
      if (from === to || from < 0 || from >= day.meals.length) return;
      const [meal] = day.meals.splice(from, 1);
      day.meals.splice(Math.max(0, Math.min(to, day.meals.length)), 0, meal);
      commit();
    },

    /** Set 0-based position of a meal (used by settings modal / arrows). */
    setPosition(instanceId, position) {
      const from = day.meals.findIndex((m) => m.instanceId === instanceId);
      this.moveMeal(from, position);
    },

    /** value = number → override for today; null/'' or equal to recipe default → remove override. */
    setOverride(instanceId, ingredientId, value) {
      const meal = find(instanceId);
      const num = Number(value);
      const clamped = Math.max(0, num);
      const recipe = recipesById.get(meal.recipeId);
      const ing = recipe?.ingredients?.find((i) => i.id === ingredientId);
      if (
        value === null ||
        value === '' ||
        !Number.isFinite(num) ||
        (ing && Math.abs(clamped - ing.amount) < 1e-6)
      ) {
        delete meal.overrides[ingredientId];
      } else {
        meal.overrides[ingredientId] = clamped;
      }
      if (meal.locked && meal.frozenAmounts) delete meal.frozenAmounts[ingredientId];
      commit();
    },

    resetOverrides(instanceId) {
      const meal = find(instanceId);
      meal.overrides = {};
      commit();
    },

    setWeight(instanceId, weight) {
      const w = Number(weight);
      find(instanceId).weight = Number.isFinite(w) && w > 0 ? w : 1;
      commit();
    },

    /** Locking freezes the currently computed amounts of the meal. */
    setLocked(instanceId, locked) {
      const meal = find(instanceId);
      meal.locked = !!locked;
      meal.frozenAmounts = locked ? currentAmounts(instanceId) : null;
      commit();
    },

    resetDay() {
      day = emptyDay(day.date);
      commit();
    },

    /** Switch to a new day if the calendar date changed. Returns true if switched. */
    checkDate() {
      const today = dateKey(now());
      if (today === day.date) return false;
      day = load(today);
      cleanup();
      commit();
      return true;
    },

    exportDay() {
      return JSON.stringify({ day, plan: summarizePlan(plan) }, null, 2);
    },
  };
}

function summarizePlan(plan) {
  return {
    targets: plan.targets,
    totals: plan.totals,
    meals: plan.meals
      .filter((m) => !m.missing)
      .map((m) => ({
        position: m.position,
        type: m.fixed ? 'fixed' : 'prepared',
        recipe: m.recipe.name,
        totals: m.solution.totals,
        ingredients: m.solution.items.map((it) => ({
          name: it.ingredient.name,
          amount: it.amount,
          unit: it.ingredient.unit,
          source: it.source,
        })),
      })),
  };
}

