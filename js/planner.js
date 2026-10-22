// Sequential day planner – pure, no DOM access.
//
// Meals are processed in their order against the total daily target:
//   R_i = max(0, T_day - consumed_before_i)
//
// Ingredients are never automatically scaled or shrunk. If a meal pushes the
// day above the daily target for calories or any macro, `solution.overLimit`
// and `solution.overBy` report the excess so the UI can warn the user to
// adjust manually.

import { NUTRIENTS, zero, add, sub, clampMin0, deviationPercent } from './nutrition.js';
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

  let consumed = zero();
  let position = 0;
  const results = meals.map((meal) => {
    if (isFixedMeal(meal)) {
      position += 1;
      const totals = { ...zero(), ...(meal.nutrition || {}) };
      const remaining = clampMin0(sub(targets, consumed));
      const overBy = zero();
      let overLimit = false;
      for (const k of NUTRIENTS) {
        const diff = totals[k] - remaining[k];
        if (diff > 1e-6) {
          overBy[k] = diff;
          overLimit = true;
        }
      }
      consumed = add(consumed, totals);
      return {
        meal,
        fixed: true,
        recipe: { id: meal.instanceId, name: meal.name || 'Fixed meal', ingredients: [] },
        missing: false,
        position,
        share: 1,
        target: remaining,
        solution: { items: [], totals, defaultTotals: totals, target: remaining, overLimit, overBy },
        deviation: zero(),
      };
    }

    const recipe = recipesById.get(meal.recipeId);
    if (!recipe) {
      return { meal, fixed: false, recipe: null, missing: true, position: null };
    }
    position += 1;

    // Remaining daily target available before this meal
    const remaining = clampMin0(sub(targets, consumed));

    const overrides = meal.locked
      ? { ...(meal.frozenAmounts || {}), ...(meal.overrides || {}) }
      : meal.overrides || {};

    const solution = solveMeal(recipe, {
      target: remaining,
      overrides,
    });
    consumed = add(consumed, solution.totals);

    return {
      meal,
      fixed: false,
      recipe,
      missing: false,
      position,
      share: 1,
      target: remaining,
      solution,
      deviation: deviationPercent(solution.totals, remaining),
    };
  });

  return {
    meals: results,
    totals: consumed,
    targets,
    remaining: sub(targets, consumed),
    deviation: deviationPercent(consumed, targets),
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
