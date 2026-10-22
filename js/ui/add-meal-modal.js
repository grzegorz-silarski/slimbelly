// Recipe picker modal.

import { ingredientNutrition, sumNutrition } from '../nutrition.js';
import { escapeHtml, fmtKcal, macroLine } from './format.js';

/**
 * @param {HTMLDialogElement} dialog
 * @param {{ recipes: object[], onPick: (recipeId: string) => void }} opts
 */
export function createAddMealModal(dialog, { recipes, onPick }) {
  const search = dialog.querySelector('[data-role="search"]');
  const tagsEl = dialog.querySelector('[data-role="tags"]');
  const listEl = dialog.querySelector('[data-role="list"]');
  let activeTag = null;

  // default nutrition per recipe, exactly as written in the JSON file
  const defaults = new Map(
    recipes.map((r) => [r.id, sumNutrition(r.ingredients.map((ing) => ingredientNutrition(ing, ing.amount)))])
  );

  const allTags = [...new Set(recipes.flatMap((r) => r.tags || []))].sort();

  function renderTags() {
    const btn = (tag, label) =>
      `<button type="button" class="btn btn-xs ${activeTag === tag ? 'btn-primary' : 'btn-ghost border-base-300'}" data-tag="${escapeHtml(tag ?? '')}">${escapeHtml(label)}</button>`;
    tagsEl.innerHTML = [btn(null, 'All'), ...allTags.map((t) => btn(t, t))].join('');
  }

  function renderList() {
    const q = search.value.trim().toLowerCase();
    const matches = recipes.filter((r) => {
      if (activeTag && !(r.tags || []).includes(activeTag)) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q)) ||
        (r.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    });
    if (!matches.length) {
      listEl.innerHTML = `<li class="p-4 text-center opacity-60">No recipes match.</li>`;
      return;
    }
    listEl.innerHTML = matches
      .map((r) => {
        const d = defaults.get(r.id);
        return `
        <li>
          <button type="button" class="w-full text-left p-3 rounded-box hover:bg-base-200 focus-visible:bg-base-200 flex flex-col gap-1" data-recipe="${escapeHtml(r.id)}">
            <span class="flex items-center justify-between gap-2">
              <span class="font-semibold">${escapeHtml(r.name)}</span>
              <span class="text-sm whitespace-nowrap">${fmtKcal(d.kcal)} kcal</span>
            </span>
            <span class="text-xs opacity-70">${macroLine(d)} · as written in recipe</span>
            <span class="text-xs opacity-60 truncate">${r.ingredients.map((i) => escapeHtml(i.name)).join(', ')}</span>
            ${(r.tags || []).length ? `<span class="flex gap-1">${r.tags.map((t) => `<span class="badge badge-outline badge-xs">${escapeHtml(t)}</span>`).join('')}</span>` : ''}
          </button>
        </li>`;
      })
      .join('');
  }

  search.addEventListener('input', renderList);
  tagsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tag]');
    if (!b) return;
    activeTag = b.dataset.tag || null;
    renderTags();
    renderList();
  });
  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-recipe]');
    if (!b) return;
    dialog.close();
    onPick(b.dataset.recipe);
  });

  return {
    open() {
      search.value = '';
      activeTag = null;
      renderTags();
      renderList();
      dialog.showModal();
      // don't pop the keyboard on mobile; focus search on pointer-fine devices
      if (window.matchMedia('(pointer: fine)').matches) search.focus();
    },
  };
}
