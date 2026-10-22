// Meal settings modal: position, weight (share), lock, reset overrides, remove.

import { fmtAmount } from './format.js';
import { icons } from './icons.js';

/**
 * @param {HTMLDialogElement} dialog
 * @param {{ store: object, onRemoved?: (name: string) => void }} opts
 */
export function createMealSettingsModal(dialog, { store, onRemoved }) {
  const body = dialog.querySelector('[data-role="body"]');
  const titleEl = dialog.querySelector('[data-role="title"]');
  let currentId = null;

  function render() {
    if (!currentId) return;
    const day = store.getDay();
    const index = day.meals.findIndex((m) => m.instanceId === currentId);
    if (index < 0) {
      dialog.close();
      return;
    }
    const meal = day.meals[index];
    const isFixed = meal.type === 'fixed';
    const mp = store.getPlan().meals.find((m) => m.meal.instanceId === currentId);
    const name = mp?.recipe?.name ?? meal.name ?? meal.recipeId;
    const overrideCount = Object.keys(meal.overrides || {}).length;
    titleEl.textContent = name;

    const options = day.meals
      .map((_, i) => `<option value="${i}" ${i === index ? 'selected' : ''}>${i + 1}</option>`)
      .join('');

    body.innerHTML = `
      <div class="flex flex-col gap-5">
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Order in the day</legend>
          <div class="join">
            <button type="button" class="btn join-item" data-act="up" ${index === 0 ? 'disabled' : ''} aria-label="Move earlier">${icons.chevronUp('size-4')}</button>
            <select class="select join-item w-24" data-act="position" aria-label="Position">${options}</select>
            <button type="button" class="btn join-item" data-act="down" ${index === day.meals.length - 1 ? 'disabled' : ''} aria-label="Move later">${icons.chevronDown('size-4')}</button>
          </div>
          <p class="label whitespace-normal">${
            isFixed
              ? 'This is a fixed meal – its nutrition never changes, and prepared meals after it recalculate to fit your daily target.'
              : 'Meals are calculated in this order. Changing it recalculates all prepared meals after the new position.'
          }</p>
        </fieldset>

        ${
          isFixed
            ? ''
            : `
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Share weight</legend>
          <input type="number" class="input w-32" min="0.25" step="0.25" value="${fmtAmount(meal.weight || 1)}" data-act="weight" aria-label="Share weight" />
          <p class="label whitespace-normal">Relative share of the remaining daily budget (1 = equal split, 2 = double portion).</p>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Lock amounts</legend>
          <label class="label cursor-pointer gap-3 text-base-content">
            <input type="checkbox" class="toggle toggle-warning" data-act="lock" ${meal.locked ? 'checked' : ''} />
            Freeze current amounts (not re-optimised)
          </label>
        </fieldset>`
        }

        <div class="flex flex-wrap gap-2 pt-2 border-t border-base-300">
          ${
            isFixed
              ? ''
              : `<button type="button" class="btn btn-outline btn-sm" data-act="reset" ${overrideCount ? '' : 'disabled'}>
            ${icons.reset('size-4')} Reset ${overrideCount || ''} override${overrideCount === 1 ? '' : 's'}
          </button>`
          }
          <button type="button" class="btn btn-error btn-outline btn-sm ml-auto" data-act="remove">
            ${icons.trash('size-4')} Remove meal
          </button>
        </div>
      </div>`;
  }

  body.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !currentId) return;
    const index = store.getDay().meals.findIndex((m) => m.instanceId === currentId);
    switch (el.dataset.act) {
      case 'up':
        store.setPosition(currentId, index - 1);
        break;
      case 'down':
        store.setPosition(currentId, index + 1);
        break;
      case 'reset':
        store.resetOverrides(currentId);
        break;
      case 'remove': {
        const name = titleEl.textContent;
        const id = currentId;
        currentId = null;
        dialog.close();
        store.removeMeal(id);
        onRemoved?.(name);
        break;
      }
    }
  });

  body.addEventListener('change', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !currentId) return;
    switch (el.dataset.act) {
      case 'position':
        store.setPosition(currentId, Number(el.value));
        break;
      case 'weight':
        store.setWeight(currentId, el.value);
        break;
      case 'lock':
        store.setLocked(currentId, el.checked);
        break;
    }
  });

  dialog.addEventListener('close', () => {
    currentId = null;
  });
  store.subscribe(() => {
    if (dialog.open) render();
  });

  return {
    open(instanceId) {
      currentId = instanceId;
      render();
      dialog.showModal();
    },
  };
}
