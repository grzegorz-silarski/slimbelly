import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planDay, toleranceStatus } from '../js/planner.js';
import { validateConfig, validateRecipe } from '../js/validation.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url)));
const { config } = validateConfig(read('config.json'));
const index = read('recipes/index.json');
const recipesById = new Map(index.recipes.map((f) => read(`recipes/${f}`)).map((r) => [r.id, r]));

const day = (...ids) => ({
  meals: ids.map((recipeId, i) => ({ instanceId: `m${i}`, recipeId, weight: 1, locked: false, overrides: {} })),
});
const amountsOf = (mealPlan) => mealPlan.solution.items.map((i) => i.amount);

test('first meal only gets 1/plannedMealsPerDay of the day', () => {
  const plan = planDay(day('oatmeal-whey'), recipesById, config);
  const t = plan.meals[0].target;
  assert.ok(Math.abs(t.kcal - config.targets.kcal / config.plannedMealsPerDay) < 1e-9);
  assert.equal(plan.emptySlots, config.plannedMealsPerDay - 1);
});

test('weights change the share', () => {
  const d = day('oatmeal-whey', 'chicken-rice-bowl');
  d.meals[0].weight = 2;
  const plan = planDay(d, recipesById, config);
  // share = 2 / (2 + 1 + 2 empty slots) = 0.4
  assert.ok(Math.abs(plan.meals[0].share - 0.4) < 1e-9);
});

test('last planned meal closes the day near the target', () => {
  const plan = planDay(day('oatmeal-whey', 'chicken-rice-bowl', 'greek-yogurt-bowl', 'salmon-potatoes'), recipesById, config);
  assert.equal(plan.meals[3].share, 1);
  assert.ok(Math.abs(plan.deviation.kcal) < 5, `day kcal deviation ${plan.deviation.kcal.toFixed(1)}%`);
  assert.ok(Math.abs(plan.deviation.protein) < 10, `day protein deviation ${plan.deviation.protein.toFixed(1)}%`);
});

test('override in meal k leaves earlier meals unchanged and recalculates later ones', () => {
  const base = day('oatmeal-whey', 'chicken-rice-bowl', 'greek-yogurt-bowl', 'beef-pasta');
  const before = planDay(base, recipesById, config);

  const changed = structuredClone(base);
  changed.meals[1].overrides = { rice: 180 };
  const after = planDay(changed, recipesById, config);

  assert.deepEqual(amountsOf(after.meals[0]), amountsOf(before.meals[0]));
  assert.notDeepEqual(amountsOf(after.meals[2]), amountsOf(before.meals[2]));
  assert.ok(after.meals[2].target.kcal < before.meals[2].target.kcal);
  assert.ok(after.meals[3].target.carbs < before.meals[3].target.carbs);
});

test('reordering changes the result', () => {
  // yogurt in slot 3 (1/2 of remainder) vs slot 4 (whole remainder)
  const a = planDay(day('oatmeal-whey', 'beef-pasta', 'greek-yogurt-bowl', 'chicken-rice-bowl'), recipesById, config);
  const b = planDay(day('oatmeal-whey', 'beef-pasta', 'chicken-rice-bowl', 'greek-yogurt-bowl'), recipesById, config);
  assert.notDeepEqual(amountsOf(a.meals[2]), amountsOf(b.meals[3]));
  assert.notDeepEqual(amountsOf(a.meals[3]), amountsOf(b.meals[2]));
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

test('all bundled recipes and config validate cleanly', () => {
  const cfgRes = validateConfig(read('config.json'));
  assert.deepEqual(cfgRes.errors, []);
  assert.deepEqual(cfgRes.warnings, []);
  for (const file of index.recipes) {
    const res = validateRecipe(read(`recipes/${file}`), file);
    assert.deepEqual(res.errors, [], `${file} errors`);
    assert.deepEqual(res.warnings, [], `${file} warnings`);
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
  // 30% of 2400 = 720 kcal -> 180g P; 40% = 960 kcal -> 240g C; 30% = 720 kcal -> 80g F
  assert.deepEqual(pctCfg.targets, { kcal: 2400, protein: 180, carbs: 240, fat: 80 });
  assert.deepEqual(pctCfg.rawTargets, { kcal: 2400, protein: 30, carbs: 40, fat: 30 });

  // Also supports string percentages like "25%" and custom kcalPerGram
  const { config: strCfg, errors: strErr } = validateConfig({
    targets: { kcal: 2000, protein: '30%', carbs: '50%', fat: '20%' },
    kcalPerGram: { protein: 4, carbs: 4, fat: 8 },
  });
  assert.deepEqual(strErr, []);
  assert.equal(strCfg.macroMode, 'percentage');
  assert.equal(strCfg.targets.protein, 150);
  assert.equal(strCfg.targets.carbs, 250);
  assert.equal(strCfg.targets.fat, 50); // 400 kcal / 8 kcal/g = 50 g
});

test('fixed meals never scale and only prepared meals after them recalculate when reordered', () => {
  const coffee = {
    instanceId: 'f_coffee',
    type: 'fixed',
    name: 'Latte',
    nutrition: { kcal: 200, protein: 10, carbs: 16, fat: 10 },
  };
  const prep1 = { instanceId: 'm1', type: 'prepared', recipeId: 'oatmeal-whey', weight: 1, locked: false, overrides: {} };
  const prep2 = { instanceId: 'm2', type: 'prepared', recipeId: 'chicken-rice-bowl', weight: 1, locked: false, overrides: {} };

  // Order A: prep1 -> coffee (fixed) -> prep2
  const planA = planDay({ meals: [prep1, coffee, prep2] }, recipesById, config);
  assert.equal(planA.meals[1].fixed, true);
  assert.deepEqual(planA.meals[1].solution.totals, coffee.nutrition);

  // Order B: coffee (fixed) -> prep1 -> prep2
  const planB = planDay({ meals: [coffee, prep1, prep2] }, recipesById, config);
  assert.equal(planB.meals[0].fixed, true);
  assert.deepEqual(planB.meals[0].solution.totals, coffee.nutrition);

  // prep1 was before coffee in A, and is after coffee in B -> prep1's target decreases in B
  assert.ok(planB.meals[1].target.kcal < planA.meals[0].target.kcal);
});



