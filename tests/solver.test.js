import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solveMeal } from '../js/solver.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./data/recipes/${name}.json`, import.meta.url)));
const oatmeal = load('oatmeal-whey');
const chickenSkyr = JSON.parse(readFileSync(new URL('../data/recipes/chicken-in-skyr.json', import.meta.url)));

test('meal within remaining budget keeps exact recipe amounts and overLimit is false', () => {
  const res = solveMeal(chickenSkyr, {
    target: { kcal: 2750, protein: 234, carbs: 261, fat: 86 },
  });
  assert.equal(res.overLimit, false);
  for (const it of res.items) {
    assert.equal(it.amount, it.ingredient.amount, `${it.ingredient.id} should stay at recipe default`);
  }
});

test('overriding one ingredient in a meal only changes that ingredient', () => {
  const res = solveMeal(chickenSkyr, {
    target: { kcal: 2750, protein: 234, carbs: 261, fat: 86 },
    overrides: { 'skyr-natural': 250 },
  });
  assert.equal(res.overLimit, false);
  const skyr = res.items.find((i) => i.ingredient.id === 'skyr-natural');
  const pb = res.items.find((i) => i.ingredient.id === 'peanut-butter');
  const chicken = res.items.find((i) => i.ingredient.id === 'chicken-breast-strips');
  const honey = res.items.find((i) => i.ingredient.id === 'honey');
  assert.equal(skyr.amount, 250);
  assert.equal(pb.amount, 1);
  assert.equal(chicken.amount, 400);
  assert.equal(honey.amount, 1);
});

test('meal exceeding remaining budget does not shrink ingredients and reports overLimit + overBy', () => {
  // Chicken in SKYR default is ~724 kcal, 110.7g P, 29g C, 18.4g F.
  const budget = { kcal: 450, protein: 50, carbs: 100, fat: 30 };
  const res = solveMeal(chickenSkyr, { target: budget });
  assert.equal(res.overLimit, true);
  assert.ok(res.overBy.kcal > 200);
  assert.ok(res.overBy.protein > 60);
  assert.equal(res.overBy.carbs, 0);
  assert.equal(res.overBy.fat, 0);
  for (const it of res.items) {
    assert.equal(it.amount, it.ingredient.amount, `${it.ingredient.id} must remain at recipe default`);
  }
});

test('overridden and fixed ingredients are marked accurately', () => {
  const res = solveMeal(oatmeal, {
    target: { kcal: 250, protein: 20, carbs: 30, fat: 8 },
    overrides: { oats: 42 },
  });
  const oats = res.items.find((i) => i.ingredient.id === 'oats');
  const cinnamon = res.items.find((i) => i.ingredient.id === 'cinnamon');
  assert.equal(oats.amount, 42);
  assert.equal(oats.source, 'override');
  assert.equal(cinnamon.amount, 2);
  assert.equal(cinnamon.source, 'fixed');
});
