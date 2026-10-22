import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planDay, toleranceStatus } from '../js/planner.js';
import { validateConfig, validateRecipe } from '../js/validation.js';

const read = (p) => JSON.parse(readFileSync(new URL(`./data/${p}`, import.meta.url)));
const { config } = validateConfig(read('config.json'));
const index = read('recipes/index.json');
const recipesById = new Map(index.recipes.map((f) => read(`recipes/${f}`)).map((r) => [r.id, r]));
const chickenSkyr = JSON.parse(readFileSync(new URL('../data/recipes/chicken-in-skyr.json', import.meta.url)));
recipesById.set(chickenSkyr.id, chickenSkyr);

const day = (...ids) => ({
  meals: ids.map((recipeId, i) => ({ instanceId: `m${i}`, recipeId, weight: 1, locked: false, overrides: {} })),
});
const amountsOf = (mealPlan) => mealPlan.solution.items.map((i) => i.amount);

test('first meal has full remaining daily budget and keeps recipe amounts when under limit', () => {
  const plan = planDay(day('chicken-in-skyr'), recipesById, config);
  assert.deepEqual(plan.meals[0].target, config.targets);
  assert.equal(plan.meals[0].solution.overLimit, false);
  for (const it of plan.meals[0].solution.items) {
    assert.equal(it.amount, it.ingredient.amount);
  }
});

test('later meal that exceeds remaining daily limit keeps amounts and flags overLimit', () => {
  // 2 x chicken-in-skyr: each has 110.7g protein; daily target has 180g protein
  // Meal 1 (110.7g P) fits -> overLimit: false
  // Meal 2 (110.7g P, only 69.3g P left) -> keeps full recipe amounts and flags overLimit: true
  const plan = planDay(day('chicken-in-skyr', 'chicken-in-skyr'), recipesById, config);
  assert.equal(plan.meals[0].solution.overLimit, false);
  assert.equal(plan.meals[1].solution.overLimit, true);
  assert.ok(plan.meals[1].solution.overBy.protein > 40);
  for (const it of plan.meals[1].solution.items) {
    assert.equal(it.amount, it.ingredient.amount);
  }
});

test('override in meal 1 only changes that ingredient and updates remaining budget for later meals', () => {
  const base = day('chicken-in-skyr', 'chicken-rice-bowl', 'beef-pasta', 'salmon-potatoes');
  const before = planDay(base, recipesById, config);

  const changed = structuredClone(base);
  changed.meals[0].overrides = { 'skyr-natural': 250 };
  const after = planDay(changed, recipesById, config);

  // Other ingredients in meal 1 (peanut-butter, chicken-breast-strips, honey) are unchanged
  const meal1Before = Object.fromEntries(before.meals[0].solution.items.map((i) => [i.ingredient.id, i.amount]));
  const meal1After = Object.fromEntries(after.meals[0].solution.items.map((i) => [i.ingredient.id, i.amount]));
  assert.equal(meal1After['skyr-natural'], 250);
  assert.equal(meal1After['peanut-butter'], meal1Before['peanut-butter']);
  assert.equal(meal1After['chicken-breast-strips'], meal1Before['chicken-breast-strips']);
  assert.equal(meal1After.honey, meal1Before.honey);

  // Remaining budget before subsequent meals decreases while their amounts stay untouched
  assert.ok(after.meals[1].target.protein < before.meals[1].target.protein);
  assert.deepEqual(amountsOf(after.meals[1]), amountsOf(before.meals[1]));
});

test('reordering meals changes which meal is flagged as over the remaining daily limit', () => {
  const a = planDay(day('chicken-in-skyr', 'beef-pasta', 'salmon-potatoes'), recipesById, config);
  const b = planDay(day('salmon-potatoes', 'beef-pasta', 'chicken-in-skyr'), recipesById, config);
  assert.equal(a.meals[0].solution.overLimit, false);
  assert.equal(a.meals[2].solution.overLimit, true);
  assert.equal(b.meals[0].solution.overLimit, false);
  assert.equal(b.meals[2].solution.overLimit, true);
});

test('locked meal keeps its frozen amounts', () => {
  const d = day('oatmeal-whey', 'chicken-rice-bowl');
  const frozenAmounts = { oats: 50, whey: 20, milk: 150, banana: 1, cinnamon: 2 };
  d.meals[0].locked = true;
  d.meals[0].frozenAmounts = frozenAmounts;
  const plan = planDay(d, recipesById, config);
  for (const it of plan.meals[0].solution.items) assert.equal(it.amount, frozenAmounts[it.ingredient.id]);
});

test('missing recipe is reported and skipped', () => {
  const plan = planDay(day('does-not-exist', 'oatmeal-whey'), recipesById, config);
  assert.equal(plan.meals[0].missing, true);
  assert.equal(plan.meals[1].position, 1);
});

test('exceeding the target clamps remaining budget at zero', () => {
  const d = day('chicken-rice-bowl', 'oatmeal-whey');
  d.meals[0].overrides = { rice: 1000, 'olive-oil': 200 };
  const plan = planDay(d, recipesById, config);
  assert.equal(plan.meals[1].target.kcal, 0);
  assert.ok(plan.remaining.kcal < 0);
});

test('toleranceStatus', () => {
  assert.equal(toleranceStatus(2, 3), 'ok');
  assert.equal(toleranceStatus(-7, 3), 'warn');
  assert.equal(toleranceStatus(20, 3), 'bad');
  assert.equal(toleranceStatus(Infinity, 3), 'bad');
});

test('all test recipes and app config validate cleanly', () => {
  const testCfgRes = validateConfig(read('config.json'));
  assert.deepEqual(testCfgRes.errors, []);
  assert.deepEqual(testCfgRes.warnings, []);
  const appCfgRes = validateConfig(JSON.parse(readFileSync(new URL('../data/config.json', import.meta.url))));
  assert.deepEqual(appCfgRes.errors, []);
  assert.deepEqual(appCfgRes.warnings, []);
  for (const file of index.recipes) {
    const res = validateRecipe(read(`recipes/${file}`), file);
    assert.deepEqual(res.errors, [], `${file} errors`);
    assert.deepEqual(res.warnings, [], `${file} warnings`);
  }
  const appIndex = JSON.parse(readFileSync(new URL('../data/recipes/index.json', import.meta.url)));
  for (const file of appIndex.recipes) {
    const res = validateRecipe(JSON.parse(readFileSync(new URL(`../data/recipes/${file}`, import.meta.url))), file);
    assert.deepEqual(res.errors, [], `app ${file} errors`);
    assert.deepEqual(res.warnings, [], `app ${file} warnings`);
  }
});

test('percentage macroMode converts config targets to grams for planning', () => {
  const { config: pctCfg, errors, warnings } = validateConfig({
    targets: { kcal: 2400, protein: 30, carbs: 40, fat: 30 },
    macroMode: 'percentage',
    plannedMealsPerDay: 4,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(pctCfg.macroMode, 'percentage');
  assert.deepEqual(pctCfg.targets, { kcal: 2400, protein: 180, carbs: 240, fat: 80 });
  assert.deepEqual(pctCfg.rawTargets, { kcal: 2400, protein: 30, carbs: 40, fat: 30 });

  const { config: strCfg, errors: strErr } = validateConfig({
    targets: { kcal: 2000, protein: '30%', carbs: '50%', fat: '20%' },
    kcalPerGram: { protein: 4, carbs: 4, fat: 8 },
  });
  assert.deepEqual(strErr, []);
  assert.equal(strCfg.macroMode, 'percentage');
  assert.equal(strCfg.targets.protein, 150);
  assert.equal(strCfg.targets.carbs, 250);
  assert.equal(strCfg.targets.fat, 50);
});

test('fixed meals never scale and only prepared meals after them recalculate when reordered', () => {
  const coffee = {
    instanceId: 'f_coffee',
    type: 'fixed',
    name: 'Big Fixed Meal',
    nutrition: { kcal: 1200, protein: 90, carbs: 100, fat: 40 },
  };
  const prep1 = { instanceId: 'm1', type: 'prepared', recipeId: 'chicken-in-skyr', weight: 1, locked: false, overrides: {} };
  const prep2 = { instanceId: 'm2', type: 'prepared', recipeId: 'chicken-rice-bowl', weight: 1, locked: false, overrides: {} };

  // Order A: prep1 -> coffee (fixed) -> prep2
  const planA = planDay({ meals: [prep1, coffee, prep2] }, recipesById, config);
  assert.equal(planA.meals[1].fixed, true);
  assert.deepEqual(planA.meals[1].solution.totals, coffee.nutrition);
  assert.equal(planA.meals[0].solution.overLimit, false);
  assert.equal(planA.meals[2].solution.overLimit, true);

  // Order B: coffee (fixed) -> prep1 -> prep2
  const planB = planDay({ meals: [coffee, prep1, prep2] }, recipesById, config);
  assert.equal(planB.meals[0].fixed, true);
  assert.deepEqual(planB.meals[0].solution.totals, coffee.nutrition);
  // Now prep1 is after the 90g P fixed meal, so prep1 (110.7g P) exceeds remaining protein (90g P) and is flagged overLimit!
  assert.equal(planB.meals[1].solution.overLimit, true);
});
