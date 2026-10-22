// Meal cards with ingredient tables. Keyed rendering: one wrapper node per
// meal instance (data-id), re-ordered/patched in place so SortableJS and focus
// keep working across re-renders.

import { toleranceStatus } from '../planner.js';
import { escapeHtml, fmtAmount, fmtKcal, fmtG, fmtPct, macroLine } from './format.js';
import { icons } from './icons.js';

/**
 * @param {HTMLElement} container
 * @param {object} plan     result of planDay
 * @param {{ expanded: Set<string>, config: object }} ctx
 */
export function renderMealList(container, plan, ctx) {
  const focusKey = document.activeElement?.dataset?.key;
  const existing = new Map([...container.children].map((el) => [el.dataset.id, el]));
  const seen = new Set();

  plan.meals.forEach((mp) => {
    const id = mp.meal.instanceId;
    seen.add(id);
    let node = existing.get(id);
    if (!node) {
      node = document.createElement('div');
      node.className = 'meal-item';
      node.dataset.id = id;
    }
    const html = mp.missing ? missingCard(mp) : mp.fixed ? fixedMealCard(mp) : mealCard(mp, ctx);
    if (node._html !== html) {
      node.innerHTML = html;
      node._html = html;
    }
    container.appendChild(node); // moves node into correct order
  });

  for (const [id, el] of existing) if (!seen.has(id)) el.remove();

  if (focusKey) {
    const el = container.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
    if (el && document.activeElement !== el) el.focus();
  }
}

function missingCard(mp) {
  return `
    <div role="alert" class="alert alert-warning">
      <span>Recipe <code>${escapeHtml(mp.meal.recipeId)}</code> is no longer available.</span>
      <button class="btn btn-sm" data-action="remove" data-id="${escapeHtml(mp.meal.instanceId)}">Remove</button>
    </div>`;
}

function overLimitSummary(overBy) {
  const parts = [];
  if (overBy?.kcal > 1e-6) parts.push(`+${fmtKcal(overBy.kcal)} kcal`);
  if (overBy?.protein > 1e-6) parts.push(`P +${fmtG(overBy.protein)} g`);
  if (overBy?.carbs > 1e-6) parts.push(`C +${fmtG(overBy.carbs)} g`);
  if (overBy?.fat > 1e-6) parts.push(`F +${fmtG(overBy.fat)} g`);
  return parts.join(' · ');
}

function fixedMealCard(mp) {
  const { meal, recipe, solution, position } = mp;
  const id = escapeHtml(meal.instanceId);
  return `
    <article class="card bg-base-100 shadow-sm border ${solution.overLimit ? 'border-error/60' : 'border-base-300'}" aria-label="Meal ${position}: ${escapeHtml(recipe.name)} (Fixed)">
      <div class="card-body p-3 sm:p-4 gap-2">
        <div class="flex items-start gap-2">
          <button type="button" class="drag-handle btn btn-ghost btn-sm btn-square cursor-grab active:cursor-grabbing touch-none" aria-label="Drag to reorder" title="Drag to reorder">${icons.grip()}</button>
          <div class="badge badge-primary font-bold mt-1 shrink-0" title="Meal order">${position}</div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="font-semibold leading-tight">${escapeHtml(recipe.name)}</h3>
              <span class="badge badge-neutral badge-sm gap-1">${icons.lock('size-3')}Fixed</span>
              ${solution.overLimit ? '<span class="badge badge-error badge-outline badge-sm">over daily limit</span>' : ''}
            </div>
            <div class="text-sm"><b>${fmtKcal(solution.totals.kcal)} kcal</b> <span class="opacity-70">· ${macroLine(solution.totals)}</span></div>
            ${solution.overLimit
              ? `<div class="text-xs text-error font-medium">Over remaining daily limit by ${overLimitSummary(solution.overBy)}</div>`
              : '<div class="text-xs opacity-60">Fixed nutrition</div>'}
          </div>
          <button type="button" class="btn btn-ghost btn-sm btn-square" data-action="settings" data-id="${id}" aria-label="Meal settings" title="Meal settings">${icons.cog()}</button>
          <button type="button" class="btn btn-ghost btn-sm btn-square text-error" data-action="remove" data-id="${id}" aria-label="Remove meal" title="Remove meal">${icons.trash('size-4')}</button>
        </div>
      </div>
    </article>`;
}

function mealCard(mp, ctx) {
  const { meal, recipe, solution, target, position } = mp;
  const id = escapeHtml(meal.instanceId);
  const expanded = ctx.expanded.has(meal.instanceId);
  const overrideCount = Object.keys(meal.overrides || {}).length;

  const badges = [];
  if (meal.locked) badges.push(`<span class="badge badge-warning badge-sm gap-1">${icons.lock('size-3')}Locked</span>`);
  if (overrideCount) badges.push(`<span class="badge badge-accent badge-sm">${overrideCount} override${overrideCount > 1 ? 's' : ''}</span>`);
  if (solution.overLimit) {
    badges.push(`<span class="badge badge-error badge-outline badge-sm">over daily limit</span>`);
  }

  return `
    <article class="card bg-base-100 shadow-sm border ${solution.overLimit ? 'border-error/60' : 'border-base-300'}" aria-label="Meal ${position}: ${escapeHtml(recipe.name)}">
      <div class="card-body p-3 sm:p-4 gap-2">
        <div class="flex items-start gap-2">
          <button type="button" class="drag-handle btn btn-ghost btn-sm btn-square cursor-grab active:cursor-grabbing touch-none" aria-label="Drag to reorder" title="Drag to reorder">${icons.grip()}</button>
          <div class="badge badge-primary font-bold mt-1 shrink-0" title="Meal order">${position}</div>
          <button type="button" class="flex-1 min-w-0 text-left cursor-pointer" data-action="toggle" data-id="${id}" aria-expanded="${expanded}">
            <h3 class="font-semibold leading-tight">${escapeHtml(recipe.name)}</h3>
            <div class="text-sm"><b>${fmtKcal(solution.totals.kcal)} kcal</b> <span class="opacity-70">· ${macroLine(solution.totals)}</span></div>
            ${solution.overLimit
              ? `<div class="text-xs text-error font-medium">Over remaining limit by ${overLimitSummary(solution.overBy)} <span class="opacity-75 font-normal">(remaining before meal: ${fmtKcal(target.kcal)} kcal · ${macroLine(target)})</span></div>`
              : ''}
            ${badges.length ? `<div class="flex flex-wrap gap-1 mt-1">${badges.join('')}</div>` : ''}
          </button>
          ${overrideCount
            ? `<button type="button" class="btn btn-ghost btn-sm gap-1 text-accent" data-action="reset-meal" data-id="${id}" aria-label="Reset meal overrides" title="Reset all overrides in this meal">${icons.reset('size-4')}<span class="hidden sm:inline text-xs">Reset</span></button>`
            : ''}
          <button type="button" class="btn btn-ghost btn-sm btn-square" data-action="settings" data-id="${id}" aria-label="Meal settings" title="Meal settings">${icons.cog()}</button>
          <button type="button" class="btn btn-ghost btn-sm btn-square" data-action="toggle" data-id="${id}" aria-label="${expanded ? 'Collapse' : 'Expand'} ingredients">${expanded ? icons.chevronUp() : icons.chevronDown()}</button>
        </div>
        ${expanded ? ingredientTable(mp) : ''}
      </div>
    </article>`;
}

function ingredientTable(mp) {
  const { meal, solution } = mp;
  const id = escapeHtml(meal.instanceId);
  const overrideCount = Object.keys(meal.overrides || {}).length;
  const rows = solution.items.map((it) => ingredientRow(meal, it)).join('');
  const t = solution.totals;
  return `
    <div class="overflow-x-auto -mx-1">
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Ingredient</th>
            <th>Amount</th>
            <th class="text-right">kcal</th>
            <th class="text-right hidden sm:table-cell">P</th>
            <th class="text-right hidden sm:table-cell">C</th>
            <th class="text-right hidden sm:table-cell">F</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <th colspan="2">Total</th>
            <th class="text-right">${fmtKcal(t.kcal)}</th>
            <th class="text-right hidden sm:table-cell">${fmtG(t.protein)}</th>
            <th class="text-right hidden sm:table-cell">${fmtG(t.carbs)}</th>
            <th class="text-right hidden sm:table-cell">${fmtG(t.fat)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="flex items-center justify-between gap-2">
      <p class="text-xs opacity-60">Edit an amount to adjust it manually for today. Recipe files stay unchanged.</p>
      ${overrideCount
        ? `<button type="button" class="btn btn-outline btn-accent btn-xs shrink-0 gap-1" data-action="reset-meal" data-id="${id}">${icons.reset('size-3.5')} Reset overrides</button>`
        : ''}
    </div>`;
}

function ingredientRow(meal, it) {
  const ing = it.ingredient;
  const isOverride = Object.prototype.hasOwnProperty.call(meal.overrides || {}, ing.id);
  const isFrozen = meal.locked && !isOverride;
  const key = `${meal.instanceId}:${ing.id}`;

  let tag = '';
  if (isOverride) {
    tag = `<span class="badge badge-accent badge-xs">override</span> <span class="text-xs opacity-60 font-normal">(default: ${fmtAmount(ing.amount)} ${escapeHtml(ing.unit)})</span>`;
  } else if (isFrozen) {
    tag = '<span class="badge badge-warning badge-xs">locked</span>';
  } else if (it.source === 'fixed') {
    tag = '<span class="badge badge-ghost badge-xs">fixed</span>';
  }

  const hint = `Recipe default: ${fmtAmount(ing.amount)} ${ing.unit}`;

  return `
    <tr class="${isOverride ? 'bg-accent/10' : ''}">
      <td class="min-w-32">
        <div class="font-medium leading-tight">${escapeHtml(ing.name)} ${tag}</div>
        <div class="text-xs opacity-60 sm:hidden">${macroLine(it.nutrition)}</div>
      </td>
      <td class="whitespace-nowrap">
        <div class="flex items-center gap-1">
          <label class="input input-sm w-28 ${isOverride ? 'input-accent' : ''}" title="${escapeHtml(hint)}">
            <input type="number" inputmode="decimal" min="0" step="any" class="grow"
              value="${fmtAmount(it.amount)}" data-value="${fmtAmount(it.amount)}"
              data-key="${escapeHtml(key)}" data-id="${escapeHtml(meal.instanceId)}" data-ing="${escapeHtml(ing.id)}"
              aria-label="Amount of ${escapeHtml(ing.name)} in ${escapeHtml(ing.unit)}" />
            <span class="opacity-60 text-xs">${escapeHtml(ing.unit)}</span>
          </label>
          ${isOverride
            ? `<button type="button" class="btn btn-ghost btn-xs btn-square" data-action="reset-ing" data-id="${escapeHtml(meal.instanceId)}" data-ing="${escapeHtml(ing.id)}" aria-label="Reset ${escapeHtml(ing.name)} to automatic" title="Reset to automatic">${icons.reset('size-4')}</button>`
            : ''}
        </div>
      </td>
      <td class="text-right tabular-nums">${fmtKcal(it.nutrition.kcal)}</td>
      <td class="text-right tabular-nums hidden sm:table-cell">${fmtG(it.nutrition.protein)}</td>
      <td class="text-right tabular-nums hidden sm:table-cell">${fmtG(it.nutrition.carbs)}</td>
      <td class="text-right tabular-nums hidden sm:table-cell">${fmtG(it.nutrition.fat)}</td>
    </tr>`;
}

/** Wires delegated events on the meal list. */
export function bindMealListEvents(container, { store, expanded, rerender, openSettings }) {
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || !container.contains(btn)) return;
    const id = btn.dataset.id;
    switch (btn.dataset.action) {
      case 'toggle':
        expanded.has(id) ? expanded.delete(id) : expanded.add(id);
        rerender();
        break;
      case 'settings':
        openSettings(id);
        break;
      case 'reset-ing':
        store.setOverride(id, btn.dataset.ing, null);
        break;
      case 'reset-meal':
        store.resetOverrides(id);
        break;
      case 'remove':
        store.removeMeal(id);
        break;
    }
  });

  const commit = (input) => {
    if (input.value === input.dataset.value) return;
    if (input.value.trim() === '') {
      input.value = input.dataset.value; // empty input = keep current; use reset button to clear override
      return;
    }
    store.setOverride(input.dataset.id, input.dataset.ing, input.value);
  };

  container.addEventListener('change', (e) => {
    if (e.target.matches('input[data-ing]')) commit(e.target);
  });
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input[data-ing]')) {
      e.preventDefault();
      commit(e.target);
    } else if (e.key === 'Escape' && e.target.matches('input[data-ing]')) {
      e.target.value = e.target.dataset.value;
      e.target.blur();
    }
  });
}

