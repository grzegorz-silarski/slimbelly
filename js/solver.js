// Per-meal solver – pure, no DOM access.
//
// Splits a recipe's ingredients into
//   * fixed  – overridden by the user, or `adjust: false` in the recipe
//   * free   – amounts x_j bounded by [min_j, max_j]
// and finds amounts for the free ones so the meal hits its target.
//
// Objective (bounded weighted least squares, convex):
//   sum_k w_k * ((F_k + sum_j n_kj x_j - T_k) / S_k)^2
//     + lambda * sum_j ((x_j - s * d_j) / D_j)^2
// where s is the uniform scale factor that hits the kcal target, d_j the recipe
// default amount, S_k / D_j are normalisation scales. Solved with projected
// coordinate descent (exact 1-D minimisation + clamping), then rounded to each
// ingredient's step with a greedy ±step fix-up.
//
// Mode "scale" uses the same machinery with weights = kcal only and a tiny
// lambda: when no bound is active the optimum is exactly x = s * d (recipe
// ratios preserved); when bounds are hit the remaining ingredients compensate.

import {
  NUTRIENTS,
  zero,
  add,
  sumNutrition,
  perUnit,
  ingredientNutrition,
  clamp,
  roundToStep,
  clean,
} from './nutrition.js';

/** Minimal normalisation scale per nutrient (avoids division by ~0 targets). */
const SCALE_FLOOR = { kcal: 50, protein: 5, carbs: 5, fat: 3 };

const DEFAULT_SOLVER = {
  mode: 'optimize',
  weights: { kcal: 1, protein: 2, carbs: 1, fat: 1 },
  ratioPreservation: 0.3,
};

const SCALE_MODE_LAMBDA = 0.01;
const MAX_SWEEPS = 5000;
const EPS = 1e-9;

export function isAdjustable(ingredient) {
  return !!ingredient.adjust && typeof ingredient.adjust === 'object';
}

function hasOverride(overrides, id) {
  return overrides && Object.prototype.hasOwnProperty.call(overrides, id) && overrides[id] != null;
}

/**
 * @param {object} recipe              recipe object (see data/recipes/*.json)
 * @param {object} opts
 * @param {object} opts.target         { kcal, protein, carbs, fat } for this meal
 * @param {object} [opts.overrides]    { [ingredientId]: amount } – day-only overrides
 * @param {object} [opts.solver]       config.solver
 * @returns {{
 *   items: Array<{ingredient: object, amount: number, source: 'override'|'fixed'|'auto', nutrition: object, bound: null|'min'|'max'}>,
 *   totals: object, target: object, hitBounds: string[], scaleFactor: number
 * }}
 */
export function solveMeal(recipe, { target, overrides = {}, solver = {} } = {}) {
  const cfg = {
    ...DEFAULT_SOLVER,
    ...solver,
    weights: { ...DEFAULT_SOLVER.weights, ...(solver.weights || {}) },
  };
  const T = { ...zero(), ...(target || {}) };

  // ---- split ingredients --------------------------------------------------
  let fixedTotals = zero();
  const free = [];
  const items = recipe.ingredients.map((ing) => {
    if (hasOverride(overrides, ing.id)) {
      const amount = Math.max(0, Number(overrides[ing.id]));
      const nutrition = ingredientNutrition(ing, amount);
      fixedTotals = add(fixedTotals, nutrition);
      return { ingredient: ing, amount, source: 'override', nutrition, bound: null };
    }
    if (!isAdjustable(ing)) {
      const nutrition = ingredientNutrition(ing, ing.amount);
      fixedTotals = add(fixedTotals, nutrition);
      return { ingredient: ing, amount: ing.amount, source: 'fixed', nutrition, bound: null };
    }
    const item = { ingredient: ing, amount: ing.amount, source: 'auto', nutrition: null, bound: null };
    free.push(item);
    return item;
  });

  // ---- uniform scale factor that hits kcal -------------------------------
  const defaultFreeKcal = free.reduce((acc, it) => acc + perUnit(it.ingredient).kcal * it.ingredient.amount, 0);
  const s = defaultFreeKcal > EPS ? Math.max(0, (T.kcal - fixedTotals.kcal) / defaultFreeKcal) : 1;

  if (free.length > 0) {
    const weights = cfg.mode === 'scale' ? { kcal: 1, protein: 0, carbs: 0, fat: 0 } : cfg.weights;
    const lambda = cfg.mode === 'scale' ? SCALE_MODE_LAMBDA : Math.max(0, Number(cfg.ratioPreservation) || 0);
    const amounts = optimise(free, fixedTotals, T, s, weights, lambda);
    free.forEach((it, j) => {
      it.amount = amounts.x[j];
      it.bound = amounts.bound[j];
      it.nutrition = ingredientNutrition(it.ingredient, it.amount);
    });
  }

  const totals = sumNutrition(items.map((it) => it.nutrition));
  return {
    items,
    totals,
    target: T,
    hitBounds: free.filter((it) => it.bound).map((it) => it.ingredient.id),
    scaleFactor: clean(s, 4),
  };
}

/** Builds the quadratic problem and returns rounded amounts for the free ingredients. */
function optimise(free, F, T, s, weights, lambda) {
  const m = free.length;
  const S = {};
  for (const k of NUTRIENTS) S[k] = Math.max(Math.abs(T[k]), SCALE_FLOOR[k]);

  const n = free.map((it) => perUnit(it.ingredient)); // n[j][k]
  const lo = free.map((it) => it.ingredient.adjust.min ?? 0);
  const hi = free.map((it) => it.ingredient.adjust.max ?? Infinity);
  const step = free.map((it) => it.ingredient.adjust.step ?? 0);
  const d = free.map((it) => it.ingredient.amount);
  const D = free.map((it, j) => Math.max(d[j], step[j], 1e-6));
  const ref = d.map((dj) => s * dj);

  // Objective f(x) = 1/2 x^T H x + c^T x + const
  const H = Array.from({ length: m }, () => new Array(m).fill(0));
  const c = new Array(m).fill(0);
  for (const k of NUTRIENTS) {
    const w = weights[k] || 0;
    if (w === 0) continue;
    const r0 = (F[k] - T[k]) / S[k];
    for (let i = 0; i < m; i++) {
      const ai = n[i][k] / S[k];
      c[i] += 2 * w * ai * r0;
      for (let j = 0; j < m; j++) H[i][j] += 2 * w * ai * (n[j][k] / S[k]);
    }
  }
  for (let j = 0; j < m; j++) {
    H[j][j] += (2 * lambda) / (D[j] * D[j]);
    c[j] += (-2 * lambda * ref[j]) / (D[j] * D[j]);
  }

  const objective = (x) => {
    let v = 0;
    for (let i = 0; i < m; i++) {
      let hx = 0;
      for (let j = 0; j < m; j++) hx += H[i][j] * x[j];
      v += 0.5 * x[i] * hx + c[i] * x[i];
    }
    return v;
  };
  const gradient = (x, i) => {
    let g = c[i];
    for (let j = 0; j < m; j++) g += H[i][j] * x[j];
    return g;
  };

  // ---- continuous solve: projected coordinate descent ---------------------
  const x = ref.map((r, j) => clamp(r, lo[j], hi[j]));
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    let maxRelChange = 0;
    for (let j = 0; j < m; j++) {
      if (H[j][j] <= EPS) continue;
      const next = clamp(x[j] - gradient(x, j) / H[j][j], lo[j], hi[j]);
      maxRelChange = Math.max(maxRelChange, Math.abs(next - x[j]) / D[j]);
      x[j] = next;
    }
    if (maxRelChange < 1e-8) break;
  }

  // Which bounds are actively blocking the optimum (gradient pushes outward)?
  const bound = x.map((xj, j) => {
    const g = gradient(x, j);
    const tol = 1e-9 * Math.max(1, Math.abs(H[j][j]) * D[j]);
    if (xj <= lo[j] + 1e-9 && g > tol) return 'min';
    if (xj >= hi[j] - 1e-9 && g < -tol) return 'max';
    return null;
  });

  // ---- discrete: round to step + greedy ±step fix-up ----------------------
  const xr = x.map((xj, j) => roundToStep(xj, step[j], lo[j], hi[j]));
  let best = objective(xr);
  for (let iter = 0; iter < 200; iter++) {
    let bestMove = null;
    for (let j = 0; j < m; j++) {
      if (!(step[j] > 0)) continue;
      for (const dir of [-1, 1]) {
        const candidate = clean(xr[j] + dir * step[j]);
        if (candidate < lo[j] - 1e-9 || candidate > hi[j] + 1e-9) continue;
        const prev = xr[j];
        xr[j] = candidate;
        const v = objective(xr);
        xr[j] = prev;
        if (v < best - 1e-12 && (!bestMove || v < bestMove.v)) bestMove = { j, candidate, v };
      }
    }
    if (!bestMove) break;
    xr[bestMove.j] = bestMove.candidate;
    best = bestMove.v;
  }

  return { x: xr, bound };
}

