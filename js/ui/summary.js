// Daily summary: full card (sidebar / top on mobile) + slim sticky bar (mobile).

import { toleranceStatus } from '../planner.js';
import { fmtKcal, fmtG, fmtPct, MACROS, STATUS_CLASS } from './format.js';
import { icons } from './icons.js';

function statusFor(plan, config, key) {
  // While the day still has empty planned slots, progress is neutral (not "bad").
  if (plan.emptySlots > 0) return 'neutral';
  return toleranceStatus(plan.deviation[key], config.tolerance[key] ?? 5);
}

function pct(actual, target) {
  if (!target) return actual > 0 ? 100 : 0;
  return (actual / target) * 100;
}

export function renderSummary(el, plan, config) {
  const { totals, targets, remaining } = plan;
  const kcalPct = pct(totals.kcal, targets.kcal);
  const kcalStatus = statusFor(plan, config, 'kcal');
  const preparedCount = plan.meals.filter((m) => !m.missing && !m.fixed).length;
  const fixedCount = plan.meals.filter((m) => m.fixed).length;

  const macroRows = MACROS.map(({ key, label }) => {
    const status = statusFor(plan, config, key);
    const rem = remaining[key];
    return `
      <div>
        <div class="flex justify-between text-sm">
          <span class="font-medium">${label}</span>
          <span><b>${fmtG(totals[key])}</b> / ${fmtG(targets[key])} g</span>
        </div>
        <progress class="progress ${STATUS_CLASS.progress[status]} w-full" value="${Math.min(100, pct(totals[key], targets[key]))}" max="100"
          aria-label="${label} ${Math.round(pct(totals[key], targets[key]))}% of target"></progress>
        <div class="text-xs opacity-70 flex justify-between">
          <span>${rem >= 0 ? `${fmtG(rem)} g left` : `<span class="text-error">${fmtG(-rem)} g over</span>`}</span>
          ${plan.emptySlots === 0 ? `<span class="${STATUS_CLASS.text[status]}">${fmtPct(plan.deviation[key])}</span>` : ''}
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="card bg-base-100 shadow-sm border border-base-300">
      <div class="card-body p-4 gap-4">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <h2 class="card-title text-base">Daily target</h2>
            ${config.hasTargetOverride ? '<span class="badge badge-accent badge-xs">custom</span>' : ''}
          </div>
          <div class="flex items-center gap-1">
            ${config.hasTargetOverride
              ? `<button type="button" class="btn btn-ghost btn-xs gap-1 text-accent" data-action="reset-target" aria-label="Reset target to config.json" title="Reset target to config.json">${icons.reset('size-3.5')}</button>`
              : ''}
            <button type="button" class="btn btn-ghost btn-xs gap-1" data-action="open-target" aria-label="Edit daily target" title="Edit daily target (grams or percentage)">${icons.cog('size-4')} Target</button>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <div class="radial-progress ${STATUS_CLASS.text[kcalStatus]} shrink-0"
               style="--value:${Math.min(100, kcalPct).toFixed(1)}; --size:7rem; --thickness:0.6rem"
               role="progressbar" aria-valuenow="${Math.round(kcalPct)}" aria-valuemin="0" aria-valuemax="100"
               aria-label="Calories ${Math.round(kcalPct)}% of target">
            <div class="text-center text-base-content leading-tight">
              <div class="text-xl font-bold">${fmtKcal(totals.kcal)}</div>
              <div class="text-xs opacity-70">/ ${fmtKcal(targets.kcal)} kcal</div>
            </div>
          </div>
          <div class="text-sm space-y-1">
            <div>${remaining.kcal >= 0
              ? `<b>${fmtKcal(remaining.kcal)}</b> kcal left`
              : `<b class="text-error">${fmtKcal(-remaining.kcal)}</b> kcal over`}</div>
            <div class="opacity-70">${preparedCount} of ${Math.max(plan.plannedMealsPerDay, preparedCount)} prepared${fixedCount ? ` · ${fixedCount} fixed` : ''}</div>
            ${plan.emptySlots === 0
              ? `<div class="${STATUS_CLASS.text[kcalStatus]} font-medium">${fmtPct(plan.deviation.kcal)} vs target</div>`
              : `<div class="opacity-70">${plan.emptySlots} slot${plan.emptySlots > 1 ? 's' : ''} still open</div>`}
          </div>
        </div>
        <div class="space-y-3">${macroRows}</div>
        <div class="text-xs opacity-60 border-t border-base-300 pt-2">
          Mode: <b>${config.macroMode}</b> · solver: <b>${config.solver.mode}</b> · meals: <b>${config.plannedMealsPerDay}</b>
        </div>
      </div>
    </div>`;
}

export function renderSummaryBar(el, plan, config) {
  const { totals, targets } = plan;
  const cell = (label, key, unit) => {
    const status = statusFor(plan, config, key);
    const isKcal = key === 'kcal';
    const num = (v) => (isKcal ? String(Math.round(v)) : fmtG(v));
    return `
      <div class="${isKcal ? 'flex-[1.5]' : 'flex-1'} min-w-0">
        <div class="text-[0.7rem] leading-tight whitespace-nowrap"><b>${label}</b> ${num(totals[key])}<span class="opacity-60">/${num(targets[key])}${unit}</span></div>
        <progress class="progress ${STATUS_CLASS.progress[status]} h-1.5 w-full" value="${Math.min(100, pct(totals[key], targets[key]))}" max="100" aria-hidden="true"></progress>
      </div>`;
  };
  el.innerHTML = `
    <div class="flex gap-2 px-3 py-2">
      ${cell('kcal', 'kcal', '')}
      ${cell('P', 'protein', 'g')}
      ${cell('C', 'carbs', 'g')}
      ${cell('F', 'fat', 'g')}
    </div>`;
}
