// Modal for adding a fixed/ready meal (e.g. coffee, snack, restaurant item)
// whose nutrition is entered per 100 units (e.g. per 100g or 100ml) and scaled
// by portion weight/volume.

import { kcalFromMacros, clean } from '../nutrition.js';
import { fmtAmount, fmtKcal, fmtG, MACROS, escapeHtml } from './format.js';

/**
 * @param {HTMLDialogElement} dialog
 * @param {{
 *   getKcalPerGram: () => object,
 *   getUnits?: () => string[],
 *   onAdd: (meal: {
 *     name: string,
 *     amount: number,
 *     unit: string,
 *     per100: { kcal: number, protein: number, carbs: number, fat: number },
 *     kcal: number,
 *     protein: number,
 *     carbs: number,
 *     fat: number
 *   }) => void
 * }} opts
 */
export function createAddFixedMealModal(dialog, { getKcalPerGram, getUnits, onAdd }) {
  const form = dialog.querySelector('[data-role="form"]');
  const nameInput = form.querySelector('[data-field="name"]');
  const amountInput = form.querySelector('[data-field="amount"]');
  const unitSelect = form.querySelector('[data-field="unit"]');
  const kcalInput = form.querySelector('[data-field="kcal"]');
  const hintEl = form.querySelector('[data-role="hint"]');
  const calcAmountEl = form.querySelector('[data-role="calc-amount"]');
  const calcUnitEl = form.querySelector('[data-role="calc-unit"]');
  const totalKcalEl = form.querySelector('[data-role="total-kcal"]');
  const totalMacrosEl = form.querySelector('[data-role="total-macros"]');
  let kcalTouched = false;

  function syncUnitOptions() {
    const units = getUnits?.() || ['g', 'ml'];
    const current = unitSelect.value || units[0] || 'g';
    unitSelect.innerHTML = units.map((u) => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('');
    if (units.includes(current)) unitSelect.value = current;
    else unitSelect.value = units[0] || 'g';
  }

  function readDraft() {
    const val = (f) => Math.max(0, Number(form.querySelector(`[data-field="${f}"]`)?.value) || 0);
    const amount = Math.max(0, Number(amountInput?.value) || 0);
    const unit = unitSelect?.value || 'g';
    const per100 = {
      kcal: val('kcal'),
      protein: val('protein'),
      carbs: val('carbs'),
      fat: val('fat'),
    };
    const factor = amount > 0 ? amount / 100 : 0;
    const totals = {
      kcal: Math.round(per100.kcal * factor),
      protein: clean(per100.protein * factor, 1),
      carbs: clean(per100.carbs * factor, 1),
      fat: clean(per100.fat * factor, 1),
    };
    return {
      name: nameInput.value.trim(),
      amount,
      unit,
      per100,
      totals,
    };
  }

  function update() {
    const draft = readDraft();
    const unit = draft.unit;

    // Update dynamic unit labels in form
    dialog.querySelectorAll('[data-role="unit-label"]').forEach((el) => {
      el.textContent = unit;
    });

    const est = Math.round(kcalFromMacros(draft.per100, getKcalPerGram?.()));
    if (!kcalTouched && (draft.per100.protein > 0 || draft.per100.carbs > 0 || draft.per100.fat > 0)) {
      kcalInput.value = String(est);
      draft.per100.kcal = est;
      const factor = draft.amount > 0 ? draft.amount / 100 : 0;
      draft.totals.kcal = Math.round(est * factor);
    }

    if (calcAmountEl) calcAmountEl.textContent = fmtAmount(draft.amount);
    if (calcUnitEl) calcUnitEl.textContent = unit;
    if (totalKcalEl) totalKcalEl.textContent = fmtKcal(draft.totals.kcal);
    if (totalMacrosEl) {
      totalMacrosEl.textContent = `P ${fmtG(draft.totals.protein)} · C ${fmtG(draft.totals.carbs)} · F ${fmtG(draft.totals.fat)}`;
    }

    if (hintEl) {
      hintEl.textContent =
        est > 0
          ? `Per 100 ${unit} estimate: ${fmtKcal(est)} kcal · Calculated for ${fmtAmount(draft.amount)} ${unit}.`
          : `Nutrition is specified per 100 ${unit} and calculated for ${fmtAmount(draft.amount)} ${unit}.`;
    }
  }

  form.addEventListener('input', (e) => {
    const field = e.target.dataset?.field;
    if (!field) return;
    if (field === 'kcal') kcalTouched = e.target.value.trim() !== '';
    update();
  });

  form.addEventListener('change', (e) => {
    if (e.target.dataset?.field === 'unit') {
      update();
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const draft = readDraft();
    if (!draft.name) {
      nameInput.focus();
      return;
    }
    dialog.close();
    onAdd({
      name: draft.name,
      amount: draft.amount,
      unit: draft.unit,
      per100: draft.per100,
      kcal: draft.totals.kcal,
      protein: draft.totals.protein,
      carbs: draft.totals.carbs,
      fat: draft.totals.fat,
    });
  });

  return {
    open() {
      form.reset();
      syncUnitOptions();
      kcalTouched = false;
      if (amountInput) amountInput.value = '100';
      for (const { key } of MACROS) {
        const el = form.querySelector(`[data-field="${key}"]`);
        if (el) el.value = '0';
      }
      kcalInput.value = '0';
      update();
      dialog.showModal();
      if (window.matchMedia('(pointer: fine)').matches) nameInput.focus();
    },
  };
}
