import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore, KEY_PREFIX } from '../js/state.js';
import { validateConfig } from '../js/validation.js';

const read = (p) => JSON.parse(readFileSync(new URL(`./data/${p}`, import.meta.url)));
const { config } = validateConfig(read('config.json'));
const recipesById = new Map(read('recipes/index.json').recipes.map((f) => read(`recipes/${f}`)).map((r) => [r.id, r]));

function memoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('state persists and is restored', () => {
  const storage = memoryStorage();
  const now = () => new Date(2026, 9, 22, 12);
  const s1 = createStore({ recipesById, config, storage, now });
  const id = s1.addMeal('oatmeal-whey');
  s1.setOverride(id, 'oats', 55);
  const s2 = createStore({ recipesById, config, storage, now });
  assert.equal(s2.getDay().meals.length, 1);
  assert.equal(s2.getDay().meals[0].overrides.oats, 55);
  assert.ok(storage.getItem(KEY_PREFIX + '2026-10-22'));
});

test('overrides never touch recipe data', () => {
  const before = JSON.stringify(recipesById.get('oatmeal-whey'));
  const s = createStore({ recipesById, config, storage: memoryStorage() });
  const id = s.addMeal('oatmeal-whey');
  s.setOverride(id, 'oats', 999);
  assert.equal(JSON.stringify(recipesById.get('oatmeal-whey')), before);
});

test('moveMeal, setPosition, remove, clear override', () => {
  const s = createStore({ recipesById, config, storage: memoryStorage() });
  const a = s.addMeal('oatmeal-whey');
  const b = s.addMeal('beef-pasta');
  const c = s.addMeal('greek-yogurt-bowl');
  s.moveMeal(2, 0);
  assert.deepEqual(s.getDay().meals.map((m) => m.instanceId), [c, a, b]);
  s.setPosition(c, 2);
  assert.deepEqual(s.getDay().meals.map((m) => m.instanceId), [a, b, c]);
  s.setOverride(a, 'oats', 40);
  assert.equal(s.getDay().meals[0].overrides.oats, 40);
  // Typing the recipe default (70g for oats in oatmeal-whey) removes the override automatically
  s.setOverride(a, 'oats', 70);
  assert.deepEqual(s.getDay().meals[0].overrides, {});
  s.setOverride(a, 'oats', 40);
  s.setOverride(a, 'oats', '');
  assert.deepEqual(s.getDay().meals[0].overrides, {});
  s.removeMeal(b);
  assert.equal(s.getDay().meals.length, 2);
});

test('lock freezes current amounts', () => {
  const s = createStore({ recipesById, config, storage: memoryStorage() });
  const a = s.addMeal('oatmeal-whey');
  const before = s.getPlan().meals[0].solution.items.map((i) => i.amount);
  s.setLocked(a, true);
  s.addMeal('chicken-rice-bowl');
  s.setWeight(a, 3); // would change target if not locked
  assert.deepEqual(s.getPlan().meals[0].solution.items.map((i) => i.amount), before);
});

test('date change switches day and old keys are cleaned up', () => {
  const storage = memoryStorage();
  storage.setItem(KEY_PREFIX + '2026-01-01', '{"meals":[]}');
  let current = new Date(2026, 9, 22, 23, 59);
  const s = createStore({ recipesById, config, storage, now: () => current });
  assert.equal(storage.getItem(KEY_PREFIX + '2026-01-01'), null);
  s.addMeal('oatmeal-whey');
  current = new Date(2026, 9, 23, 0, 1);
  assert.equal(s.checkDate(), true);
  assert.equal(s.getDay().date, '2026-10-23');
  assert.equal(s.getDay().meals.length, 0);
});

test('setTargets in percentage mode stores percentage and exposes gram targets for daily view', () => {
  const storage = memoryStorage();
  const s = createStore({ recipesById, config, storage });
  s.addMeal('oatmeal-whey');
  s.setTargets({ macroMode: 'percentage', rawTargets: { kcal: 2000, protein: 30, carbs: 50, fat: 20 } });
  const activeCfg = s.getConfig();
  assert.equal(activeCfg.macroMode, 'percentage');
  assert.equal(activeCfg.hasTargetOverride, true);
  assert.equal(activeCfg.targets.protein, 150);
  assert.equal(activeCfg.targets.carbs, 250);
  assert.equal(s.getPlan().targets.protein, 150);

  s.resetTargets();
  assert.equal(s.getConfig().hasTargetOverride, false);
  assert.equal(s.getPlan().targets.protein, config.targets.protein);
});

test('addFixedMeal persists fixed meal and keeps its nutrition unchanged on reorder', () => {
  const storage = memoryStorage();
  const s = createStore({ recipesById, config, storage });
  s.addMeal('oatmeal-whey');
  const fid = s.addFixedMeal({ name: 'Coffee with milk', kcal: 80, protein: 4, carbs: 6, fat: 4 });
  assert.equal(s.getPlan().meals[1].fixed, true);
  assert.equal(s.getPlan().meals[1].solution.totals.kcal, 80);

  s.moveMeal(1, 0);
  assert.equal(s.getPlan().meals[0].meal.instanceId, fid);
  assert.equal(s.getPlan().meals[0].solution.totals.kcal, 80);

  // Reload from storage
  const s2 = createStore({ recipesById, config, storage });
  assert.equal(s2.getPlan().meals[0].fixed, true);
  assert.equal(s2.getPlan().meals[0].recipe.name, 'Coffee with milk');
  assert.equal(s2.getPlan().meals[0].solution.totals.kcal, 80);
});



