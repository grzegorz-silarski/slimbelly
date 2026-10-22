import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  perUnit,
  ingredientNutrition,
  roundToStep,
  sumNutrition,
  deviationPercent,
  clampMin0,
  macrosPercentToGrams,
  macrosGramsToPercent,
} from '../js/nutrition.js';

test('per-basis conversion for grams (per 100 g)', () => {
  const rice = { unit: 'g', per: 100, kcal: 360, protein: 7, carbs: 79, fat: 0.6 };
  const n = ingredientNutrition(rice, 70);
  assert.equal(Math.round(n.kcal), 252);
  assert.ok(Math.abs(n.carbs - 55.3) < 1e-9);
});

test('per-basis conversion for ml', () => {
  const oil = { unit: 'ml', per: 100, kcal: 820, protein: 0, carbs: 0, fat: 91 };
  assert.ok(Math.abs(ingredientNutrition(oil, 10).fat - 9.1) < 1e-9);
});

test('per-basis conversion for pieces (per 1 pc)', () => {
  const egg = { unit: 'pcs', per: 1, kcal: 72, protein: 6.3, carbs: 0.4, fat: 4.8 };
  assert.deepEqual(perUnit(egg), { kcal: 72, protein: 6.3, carbs: 0.4, fat: 4.8 });
  assert.equal(ingredientNutrition(egg, 3).kcal, 216);
});

test('roundToStep rounds and clamps without float noise', () => {
  assert.equal(roundToStep(73, 5), 75);
  assert.equal(roundToStep(0.3 * 3, 0.1), 0.9);
  assert.equal(roundToStep(2.6, 1, 0, 2), 2);
  assert.equal(roundToStep(12.34, 0), 12.34);
});

test('sum, deviation and clamp helpers', () => {
  const s = sumNutrition([
    { kcal: 100, protein: 10, carbs: 5, fat: 2 },
    { kcal: 50, protein: 0, carbs: 10, fat: 1 },
  ]);
  assert.deepEqual(s, { kcal: 150, protein: 10, carbs: 15, fat: 3 });
  const d = deviationPercent({ kcal: 110, protein: 0, carbs: 0, fat: 1 }, { kcal: 100, protein: 0, carbs: 10, fat: 0 });
  assert.equal(Math.round(d.kcal), 10);
  assert.equal(d.protein, 0);
  assert.equal(d.carbs, -100);
  assert.equal(d.fat, Infinity);
  assert.deepEqual(clampMin0({ kcal: -5, protein: 3, carbs: 0, fat: -1 }), { kcal: 0, protein: 3, carbs: 0, fat: 0 });
});

test('macrosPercentToGrams and macrosGramsToPercent convert accurately', () => {
  // 2000 kcal: 30% P (600 kcal -> 150 g), 45% C (900 kcal -> 225 g), 25% F (500 kcal -> 55.56 g)
  const grams = macrosPercentToGrams({ kcal: 2000, protein: 30, carbs: 45, fat: 25 });
  assert.deepEqual(grams, { kcal: 2000, protein: 150, carbs: 225, fat: 55.56 });
  const pct = macrosGramsToPercent(grams);
  assert.equal(pct.protein, 30);
  assert.equal(pct.carbs, 45);
  assert.equal(pct.fat, 25);
});


