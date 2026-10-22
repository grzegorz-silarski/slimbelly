// Per-meal calculator – pure, no DOM access.
//
// Each ingredient uses its recipe default amount unless overridden by the user
// for today. No automatic shrinking or scaling is performed; instead, if the
// meal exceeds the remaining daily budget (`target`), `overLimit` and `overBy`
// report which nutrients are above the limit so the user can adjust manually.

import {
  NUTRIENTS,
  zero,
  add,
  ingredientNutrition,
} from './nutrition.js';

export function isAdjustable(ingredient) {
  if (ingredient.adjust === false) return false;
  if (ingredient.adjust && typeof ingredient.adjust === 'object') return true;
  return (
    (ingredient.kcal || 0) > 0 ||
    (ingredient.protein || 0) > 0 ||
    (ingredient.carbs || 0) > 0 ||
    (ingredient.fat || 0) > 0
  );
}

function hasOverride(overrides, id) {
  return overrides && Object.prototype.hasOwnProperty.call(overrides, id) && overrides[id] != null;
}

/**
 * @param {object} recipe           recipe object (see data/recipes/*.json)
 * @param {object} [opts]
 * @param {object} [opts.target]    remaining daily budget { kcal, protein, carbs, fat } before this meal
 * @param {object} [opts.overrides] { [ingredientId]: amount } – day-only overrides
 * @returns {{
 *   items: Array<{ingredient: object, amount: number, source: 'override'|'fixed'|'auto', nutrition: object}>,
 *   totals: object,
 *   defaultTotals: object,
 *   target: object,
 *   overLimit: boolean,
 *   overBy: { kcal: number, protein: number, carbs: number, fat: number }
 * }}
 */
export function solveMeal(recipe, { target, overrides = {} } = {}) {
  const R = target ? { ...zero(), ...target } : null;

  let totals = zero();
  let defaultTotals = zero();

  const items = recipe.ingredients.map((ing) => {
    const defaultNutrition = ingredientNutrition(ing, ing.amount);
    defaultTotals = add(defaultTotals, defaultNutrition);

    if (hasOverride(overrides, ing.id)) {
      const amount = Math.max(0, Number(overrides[ing.id]));
      const nutrition = ingredientNutrition(ing, amount);
      totals = add(totals, nutrition);
      return { ingredient: ing, amount, source: 'override', nutrition };
    }

    const source = isAdjustable(ing) ? 'auto' : 'fixed';
    totals = add(totals, defaultNutrition);
    return { ingredient: ing, amount: ing.amount, source, nutrition: defaultNutrition };
  });

  const overBy = zero();
  let overLimit = false;
  if (R != null) {
    for (const k of NUTRIENTS) {
      const diff = totals[k] - R[k];
      if (diff > 1e-6) {
        overBy[k] = diff;
        overLimit = true;
      }
    }
  }

  return {
    items,
    totals,
    defaultTotals,
    target: R || defaultTotals,
    overLimit,
    overBy,
  };
}
