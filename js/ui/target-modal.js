// Daily target modal: configure targets in 'grams' or 'percentage' mode.
// Regardless of input mode, the daily view always displays calculated grams.

import { macrosPercentToGrams, macrosGramsToPercent, kcalFromMacros } from '../nutrition.js';
import { fmtAmount, fmtG, fmtKcal, MACROS } from './format.js';
import { icons } from './icons.js';

/**
 * @param {HTMLDialogElement} dialog
 * @param {{ store: object, onSaved?: () => void }} opts
 */
export function createTargetModal(dialog, { store, onSaved }) {
  const body = dialog.querySelector('[data-role="body"]');
  let mode = 'grams';
  let draft = { kcal: 2600, protein: 180, carbs: 300, fat: 75 };

  function loadFromStore() {
    const cfg = store.getConfig();
    mode = cfg.macroMode === 'percentage' || cfg.macroMode === 'percent' ? 'percentage' : 'grams';
    const src = cfg.rawTargets || cfg.targets;
    draft = {
      kcal: Number(src.kcal) || 0,
      protein: Number(src.protein) || 0,
      carbs: Number(src.carbs) || 0,
      fat: Number(src.fat) || 0,
    };
  }

  const kpg = () => store.getConfig().kcalPerGram || { protein: 4, carbs: 4, fat: 9 };

  function switchMode(nextMode) {
    if (nextMode === mode) return;
    if (nextMode === 'percentage') {
      draft = macrosGramsToPercent(draft, kpg());
    } else {
      draft = macrosPercentToGrams(draft, kpg());
    }
    mode = nextMode;
    render();
  }

  function computedGrams() {
    return mode === 'percentage' ? macrosPercentToGrams(draft, kpg()) : { ...draft };
  }

  function updatePreview() {
    const factors = kpg();
    const grams = computedGrams();
    const pcts = mode === 'percentage' ? draft : macrosGramsToPercent(draft, factors);
    for (const { key } of MACROS) {
      const hint = body.querySelector(`[data-hint="${key}"]`);
      if (hint) {
        hint.textContent =
          mode === 'percentage' ? `= ${fmtG(grams[key])} g` : `(${fmtAmount(pcts[key])}% of kcal)`;
      }
    }
    const summaryEl = body.querySelector('[data-role="summary"]');
    if (!summaryEl) return;
    if (mode === 'percentage') {
      const sumPct = Math.round((draft.protein + draft.carbs + draft.fat) * 10) / 10;
      const ok = Math.abs(sumPct - 100) <= 0.5;
      summaryEl.className = `text-xs ${ok ? 'text-success' : 'text-warning'}`;
      summaryEl.textContent = `Macro split total: ${fmtAmount(sumPct)}% (${ok ? 'equals 100%' : 'recommended: 100%'}) → P ${fmtG(grams.protein)} g · C ${fmtG(grams.carbs)} g · F ${fmtG(grams.fat)} g`;
    } else {
      const estKcal = Math.round(kcalFromMacros(grams, factors));
      summaryEl.className = 'text-xs opacity-70';
      summaryEl.textContent = `Macros energy: ${fmtKcal(estKcal)} kcal (${factors.protein}/${factors.carbs}/${factors.fat} kcal per g)`;
    }
  }

  function render() {
    const cfg = store.getConfig();
    const unit = mode === 'percentage' ? '%' : 'g';
    const step = mode === 'percentage' ? '1' : '5';

    const macroInputs = MACROS.map(
      ({ key, label }) => `
        <div class="flex items-center justify-between gap-3">
          <label class="text-sm font-medium w-20" for="target-${key}">${label}</label>
          <label class="input input-sm w-36">
            <input id="target-${key}" type="number" inputmode="decimal" min="0" step="${step}" class="grow"
              value="${fmtAmount(draft[key])}" data-field="${key}" aria-label="${label} in ${unit}" />
            <span class="opacity-60 text-xs">${unit}</span>
          </label>
          <span class="text-xs opacity-80 font-medium w-28 text-right tabular-nums" data-hint="${key}"></span>
        </div>`
    ).join('');

    body.innerHTML = `
      <div class="flex flex-col gap-4">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium">Macro input mode</span>
          <div class="join" role="group" aria-label="Macro input mode">
            <button type="button" class="btn btn-sm join-item ${mode === 'grams' ? 'btn-primary' : ''}" data-mode="grams">Grams (g)</button>
            <button type="button" class="btn btn-sm join-item ${mode === 'percentage' ? 'btn-primary' : ''}" data-mode="percentage">Percentage (%)</button>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3 border-b border-base-300 pb-3">
          <label class="text-sm font-medium w-20" for="target-kcal">Calories</label>
          <label class="input input-sm w-36">
            <input id="target-kcal" type="number" inputmode="numeric" min="0" step="50" class="grow"
              value="${fmtAmount(draft.kcal)}" data-field="kcal" aria-label="Target calories" />
            <span class="opacity-60 text-xs">kcal</span>
          </label>
          <span class="text-xs opacity-60 w-28 text-right">Daily total</span>
        </div>

        <div class="space-y-2.5">${macroInputs}</div>

        <div data-role="summary" class="text-xs"></div>
        <p class="text-xs opacity-60">In the daily view, macro targets and meal amounts are always shown in grams (g).</p>

        <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-base-300">
          ${cfg.hasTargetOverride
            ? `<button type="button" class="btn btn-outline btn-sm gap-1" data-act="reset-config">${icons.reset('size-4')} Reset to config.json</button>`
            : ''}
          <button type="button" class="btn btn-primary btn-sm ml-auto" data-act="save">Apply target</button>
        </div>
      </div>`;

    updatePreview();
  }

  body.addEventListener('input', (e) => {
    const field = e.target.dataset?.field;
    if (!field) return;
    draft[field] = Math.max(0, Number(e.target.value) || 0);
    updatePreview();
  });

  body.addEventListener('click', (e) => {
    const modeBtn = e.target.closest('[data-mode]');
    if (modeBtn) {
      switchMode(modeBtn.dataset.mode);
      return;
    }
    const actBtn = e.target.closest('[data-act]');
    if (!actBtn) return;
    if (actBtn.dataset.act === 'save') {
      store.setTargets({ macroMode: mode, rawTargets: draft });
      dialog.close();
      onSaved?.();
    } else if (actBtn.dataset.act === 'reset-config') {
      store.resetTargets();
      dialog.close();
      onSaved?.();
    }
  });

  return {
    open() {
      loadFromStore();
      render();
      dialog.showModal();
    },
  };
}

