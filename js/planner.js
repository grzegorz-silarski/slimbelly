// Sequential day planner – pure, no DOM access.
//
// Meals are processed strictly in their order. Each meal only "sees" the meals
// before it, so changing meal k only affects meals k+1..n.
//
// For meal i (0-based) of n added meals:
//   R_i = max(0, target - consumed_before_i)
//   N   = max(plannedMealsPerDay, n)
//   T_i = R_i * w_i / (sum_{m=i..n-1} w_m + (N - n))
// Not-yet-added planned slots count with weight 1. The last planned slot gets
// the whole remainder, so the day closes on target (within solver limits).

import { zero, add, sub, clampMin0, deviationPercent, NUTRIENTS } from './nutrition.js';
import { solveMeal } from './solver.js';

export function isFixedMeal(meal) {
  return meal?.type === 'fixed';
}

export function mealWeight(meal) {
  const w = Number(meal.weight);
  return Number.isFinite(w) && w > 0 ? w : 1;
}

/**
 * @param {{meals: Array<object>}} day
 * @param {Map<string, object>} recipesById
 * @param {object} config  normalised config (targets in grams)
 */
export function planDay(day, recipesById, config) {
  const targets = { ...zero(), ...config.targets };
  const meals = day.meals || [];
  const present = meals.map((m) => (isFixedMeal(m) ? true : recipesById.has(m.recipeId)));
  const scalable = meals.map((m, i) => present[i] && !isFixedMeal(m));
  const preparedCount = scalable.filter(Boolean).length;
  const planned = Math.max(1, Math.floor(config.plannedMealsPerDay || 1));
  const emptySlots = Math.max(planned, preparedCount) - preparedCount;

  // suffix sums of weights (only scalable prepared meals absorb remaining budget)
  const suffix = new Array(meals.length + 1).fill(0);
  for (let i = meals.length - 1; i >= 0; i--) {
    suffix[i] = suffix[i + 1] + (scalable[i] ? mealWeight(meals[i]) : 0);
  }

  let consumed = zero();
  let position = 0;
  const results = meals.map((meal, i) => {
    if (isFixedMeal(meal)) {
      position += 1;
      const totals = { ...zero(), ...(meal.nutrition || {}) };
      consumed = add(consumed, totals);
      return {
        meal,
        fixed: true,
        recipe: { id: meal.instanceId, name: meal.name || 'Fixed meal', ingredients: [] },
        missing: false,
        position,
        share: 0,
        target: totals,
        solution: { items: [], totals, target: totals, hitBounds: [], scaleFactor: 1 },
        deviation: zero(),
      };
    }

    const recipe = recipesById.get(meal.recipeId);
    if (!recipe) {
      return { meal, fixed: false, recipe: null, missing: true, position: null };
    }
    position += 1;

    const remaining = clampMin0(sub(targets, consumed));
    const share = mealWeight(meal) / (suffix[i] + emptySlots);
    const target = {};
    for (const k of NUTRIENTS) target[k] = remaining[k] * share;

    const overrides = meal.locked
      ? { ...(meal.frozenAmounts || {}), ...(meal.overrides || {}) }
      : meal.overrides || {};

    const solution = solveMeal(recipe, { target, overrides, solver: config.solver });
    consumed = add(consumed, solution.totals);

    return {
      meal,
      fixed: false,
      recipe,
      missing: false,
      position,
      share,
      target,
      solution,
      deviation: deviationPercent(solution.totals, target),
    };
  });

  return {
    meals: results,
    totals: consumed,
    targets,
    remaining: sub(targets, consumed),
    deviation: deviationPercent(consumed, targets),
    plannedMealsPerDay: planned,
    emptySlots,
  };
}

/** Status of a percentage deviation vs tolerance: 'ok' | 'warn' | 'bad'. */
export function toleranceStatus(deviationPct, tolerancePct) {
  const d = Math.abs(deviationPct);
  if (!Number.isFinite(d)) return 'bad';
  if (d <= tolerancePct) return 'ok';
  if (d <= tolerancePct * 3) return 'warn';
  return 'bad';
}

