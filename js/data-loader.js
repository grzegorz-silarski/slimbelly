// Loads config and recipes over HTTP (requires a local server – file:// blocks fetch).

import { validateConfig, validateRecipe } from './validation.js';

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`${url}: invalid JSON (${e.message})`);
  }
}

/**
 * @param {string} [base='data']
 * @returns {Promise<{ config: object|null, recipes: object[], recipesById: Map<string, object>, errors: string[], warnings: string[] }>}
 */
export async function loadData(base = 'data') {
  const errors = [];
  const warnings = [];

  let config = null;
  try {
    const result = validateConfig(await fetchJson(`${base}/config.json`));
    config = result.config;
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  } catch (e) {
    errors.push(e.message);
  }

  let files = [];
  try {
    const index = await fetchJson(`${base}/recipes/index.json`);
    if (!Array.isArray(index.recipes)) throw new Error('recipes/index.json: "recipes" must be an array of file names');
    files = index.recipes;
  } catch (e) {
    errors.push(e.message);
  }

  const loaded = await Promise.all(
    files.map(async (file) => {
      try {
        const recipe = await fetchJson(`${base}/recipes/${file}`);
        const v = validateRecipe(recipe, file);
        warnings.push(...v.warnings);
        if (v.errors.length) {
          errors.push(...v.errors);
          return null;
        }
        return recipe;
      } catch (e) {
        errors.push(e.message);
        return null;
      }
    })
  );

  const recipesById = new Map();
  for (const r of loaded) {
    if (!r) continue;
    if (recipesById.has(r.id)) {
      errors.push(`Duplicate recipe id "${r.id}" – later file skipped`);
      continue;
    }
    recipesById.set(r.id, r);
  }

  return { config, recipes: [...recipesById.values()], recipesById, errors, warnings };
}

