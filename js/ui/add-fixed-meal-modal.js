// Modal for adding a fixed/ready meal (e.g. coffee, snack, restaurant item)
// whose nutrition is constant and never scaled by the solver.

import { kcalFromMacros } from '../nutrition.js';
import { fmtKcal, MACROS } from './format.js';

/**
 * @param {HTMLDialogElement} dialog
 * @param {{ getKcalPerGram: () => object, onAdd: (meal: { name: string, kcal: number, protein: number, carbs: number, fat: number }) => void }} opts
 */
export function createAddFixedMealModal(dialog, { getKcalPerGram, onAdd }) {
  const form = dialog.querySelector('[data-role="form"]');
  const nameInput = form.querySelector('[data-field="name"]');
  const kcalInput = form.querySelector('[data-field="kcal"]');
  const hintEl = form.querySelector('[data-role="hint"]');
  let kcalTouched = false;

  function readDraft() {
    const val = (f) => Math.max(0, Number(form.querySelector(`[data-field="${f}"]`)?.value) || 0);
    return {
      name: nameInput.value.trim(),
      kcal: val('kcal'),
      protein: val('protein'),
      carbs: val('carbs'),
      fat: val('fat'),
    };
  }

  function updateHint() {
    const draft = readDraft();
    const est = Math.round(kcalFromMacros(draft, getKcalPerGram?.()));
    if (!kcalTouched && (draft.protein > 0 || draft.carbs > 0 || draft.fat > 0)) {
      kcalInput.value = String(est);
    }
    hintEl.textContent =
      est > 0 ? `Macros estimate: ${fmtKcal(est)} kcal · Fixed meals are never scaled.` : 'Fixed meals keep these exact nutrition values and are never scaled.';
  }

  form.addEventListener('input', (e) => {
    const field = e.target.dataset?.field;
    if (!field) return;
    if (field === 'kcal') kcalTouched = e.target.value.trim() !== '';
    updateHint();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const draft = readDraft();
    if (!draft.name) {
      nameInput.focus();
      return;
    }
    dialog.close();
    onAdd(draft);
  });

  return {
    open() {
      form.reset();
      kcalTouched = false;
      for (const { key } of MACROS) {
        const el = form.querySelector(`[data-field="${key}"]`);
        if (el) el.value = '0';
      }
      kcalInput.value = '0';
      updateHint();
      dialog.showModal();
      if (window.matchMedia('(pointer: fine)').matches) nameInput.focus();
    },
  };
}

