import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solveMeal } from '../js/solver.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/recipes/${name}.json`, import.meta.url)));
const bowl = load('chicken-rice-bowl');
const oatmeal = load('oatmeal-whey');

const relErr = (a, t) => Math.abs(a - t) / t;
const isMultiple = (x, step) => Math.abs(x / step - Math.round(x / step)) < 1e-9;

test('scale mode hits kcal and keeps recipe ratios when no bound is active', () => {
  const recipe = {
    id: 'r',
    name: 'r',
    ingredients: [
      { id: 'a', name: 'a', unit: 'g', amount: 100, per: 100, kcal: 100, protein: 10, carbs: 10, fat: 2, adjust: { min: 0, max: 1000 } },
      { id: 'b', name: 'b', unit: 'g', amount: 50, per: 100, kcal: 400, protein: 0, carbs: 100, fat: 0, adjust: { min: 0, max: 1000 } },
    ],
  };
  // default kcal = 100 + 200 = 300; target 450 -> s = 1.5
  const res = solveMeal(recipe, { target: { kcal: 450, protein: 0, carbs: 0, fat: 0 }, solver: { mode: 'scale' } });
  assert.equal(res.scaleFactor, 1.5);
  assert.ok(Math.abs(res.items[0].amount - 150) < 0.5);
  assert.ok(Math.abs(res.items[1].amount - 75) < 0.5);
  assert.ok(relErr(res.totals.kcal, 450) < 0.01);
});

test('optimize mode lands within a few % of a feasible target', () => {
  // build a feasible target from known amounts
  const target = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const amounts = { 'chicken-breast': 200, rice: 100, egg: 1, 'olive-oil': 10, broccoli: 150, spices: 2 };
  for (const ing of bowl.ingredients) {
    for (const k of Object.keys(target)) target[k] += (ing[k] / ing.per) * amounts[ing.id];
  }
  const res = solveMeal(bowl, { target, solver: { mode: 'optimize', ratioPreservation: 0.05 } });
  for (const k of ['kcal', 'protein', 'carbs']) {
    assert.ok(relErr(res.totals[k], target[k]) < 0.06, `${k}: ${res.totals[k]} vs ${target[k]}`);
  }
});

test('bounds and steps are respected', () => {
  const res = solveMeal(bowl, { target: { kcal: 3000, protein: 250, carbs: 300, fat: 100 } });
  for (const it of res.items) {
    const a = it.ingredient.adjust;
    if (it.source !== 'auto') continue;
    assert.ok(it.amount >= a.min - 1e-9 && it.amount <= a.max + 1e-9, `${it.ingredient.id} out of bounds`);
    assert.ok(isMultiple(it.amount, a.step), `${it.ingredient.id}=${it.amount} not multiple of ${a.step}`);
  }
  assert.ok(res.hitBounds.length > 0, 'huge target should hit upper bounds');
});

test('overridden and fixed ingredients are unchanged', () => {
  const res = solveMeal(oatmeal, {
    target: { kcal: 900, protein: 60, carbs: 110, fat: 20 },
    overrides: { oats: 42 },
  });
  const oats = res.items.find((i) => i.ingredient.id === 'oats');
  const cinnamon = res.items.find((i) => i.ingredient.id === 'cinnamon');
  assert.equal(oats.amount, 42);
  assert.equal(oats.source, 'override');
  assert.equal(cinnamon.amount, 2);
  assert.equal(cinnamon.source, 'fixed');
});

test('zero target drives free ingredients to their minimum', () => {
  const res = solveMeal(bowl, { target: { kcal: 0, protein: 0, carbs: 0, fat: 0 } });
  for (const it of res.items) {
    if (it.source === 'auto') assert.equal(it.amount, it.ingredient.adjust.min, it.ingredient.id);
  }
});

test('meal without free ingredients returns fixed amounts', () => {
  const overrides = Object.fromEntries(oatmeal.ingredients.map((i) => [i.id, 10]));
  const res = solveMeal(oatmeal, { target: { kcal: 500, protein: 30, carbs: 50, fat: 10 }, overrides });
  assert.ok(res.items.every((i) => i.amount === 10));
  assert.deepEqual(res.hitBounds, []);
});

