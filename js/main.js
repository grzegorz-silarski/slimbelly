// App bootstrap: load data, create store, wire UI.

import { loadData } from './data-loader.js';
import { createStore } from './state.js';
import { initDragAndDrop } from './dnd.js';
import { renderSummary, renderSummaryBar } from './ui/summary.js';
import { renderMealList, bindMealListEvents } from './ui/meal-list.js';
import { createAddMealModal } from './ui/add-meal-modal.js';
import { createAddFixedMealModal } from './ui/add-fixed-meal-modal.js';
import { createMealSettingsModal } from './ui/meal-settings.js';
import { createTargetModal } from './ui/target-modal.js';
import { toast } from './ui/toast.js';
import { escapeHtml } from './ui/format.js';
import { icons } from './ui/icons.js';

const $ = (sel) => document.querySelector(sel);

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const icon = icons[el.dataset.icon];
    if (icon && !el.innerHTML.trim()) el.innerHTML = icon('size-5');
  });
}

function showFatal(title, messages) {
  $('main').innerHTML = `
    <div class="lg:col-span-2 alert alert-error flex-col items-start">
      <h2 class="font-bold">${escapeHtml(title)}</h2>
      <ul class="list-disc pl-5 text-sm">${messages.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
    </div>`;
}

function showLoadErrors(errors) {
  if (!errors.length) return;
  $('#load-errors').innerHTML = `
    <div role="alert" class="alert alert-warning flex-col items-start text-sm">
      <span class="font-semibold">${errors.length} problem${errors.length > 1 ? 's' : ''} while loading data – affected recipes were skipped.</span>
      <details class="w-full">
        <summary class="cursor-pointer">Details</summary>
        <ul class="list-disc pl-5 mt-1">${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
      </details>
    </div>`;
}

function updateTodayLabel(date) {
  const [y, m, d] = date.split('-').map(Number);
  $('#today-label').textContent = new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function main() {
  hydrateIcons();

  if (location.protocol === 'file:') {
    showFatal('Please open SlimBelly through a local web server', [
      'Browsers block loading JSON files from file:// URLs.',
      'Run "npm run serve" (or "npx serve -l 8000 .") in the project folder and open http://localhost:8000',
    ]);
    return;
  }

  const data = await loadData('data');
  data.warnings.forEach((w) => console.warn('[SlimBelly]', w));
  if (!data.config) {
    showFatal('Could not load config.json', data.errors);
    return;
  }
  showLoadErrors(data.errors);

  const { config, recipes, recipesById } = data;
  const store = createStore({ recipesById, config });
  const expanded = new Set();

  const listEl = $('#meal-list');
  const render = () => {
    const plan = store.getPlan();
    const activeConfig = store.getConfig();
    const maxMeals = activeConfig.plannedMealsPerDay || 4;
    const limitReached = store.getDay().meals.length >= maxMeals;
    renderSummary($('#summary'), plan, activeConfig);
    renderSummaryBar($('#summary-bar'), plan, activeConfig);
    renderMealList(listEl, plan, { expanded, config: activeConfig });
    $('#empty-state').classList.toggle('hidden', plan.meals.length > 0);
    document.querySelectorAll('[data-action="open-add"], [data-action="open-add-fixed"]').forEach((btn) => {
      btn.disabled = limitReached;
      btn.title = limitReached ? `Daily limit of ${maxMeals} meals reached` : '';
    });
    updateTodayLabel(store.getDay().date);
  };

  const targetModal = createTargetModal($('#target-modal'), {
    store,
    onSaved: () => toast('Daily target updated', 'success'),
  });
  const settings = createMealSettingsModal($('#meal-settings-modal'), {
    store,
    onRemoved: (name) => toast(`Removed ${name}`, 'info'),
  });
  const addModal = createAddMealModal($('#add-meal-modal'), {
    recipes,
    onPick: (recipeId) => {
      const id = store.addMeal(recipeId);
      expanded.add(id);
      render();
      toast(`Prepared ${recipesById.get(recipeId).name}`, 'success');
      requestAnimationFrame(() =>
        listEl.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      );
    },
  });
  const addFixedModal = createAddFixedMealModal($('#add-fixed-meal-modal'), {
    getKcalPerGram: () => store.getConfig().kcalPerGram,
    onAdd: (meal) => {
      const id = store.addFixedMeal(meal);
      render();
      toast(`Added ${meal.name}`, 'success');
      requestAnimationFrame(() =>
        listEl.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      );
    },
  });

  bindMealListEvents(listEl, { store, expanded, rerender: render, openSettings: (id) => settings.open(id) });
  initDragAndDrop(listEl, store);
  store.subscribe(render);

  // Global actions (navbar, FAB, empty state)
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || listEl.contains(el)) return;
    switch (el.dataset.action) {
      case 'open-add': {
        const maxMeals = store.getConfig().plannedMealsPerDay || 4;
        if (store.getDay().meals.length >= maxMeals) {
          return toast(`Daily limit of ${maxMeals} meals reached`, 'warning');
        }
        if (!recipes.length) return toast('No recipes loaded – see data/recipes/README.md to add recipes', 'info');
        addModal.open();
        break;
      }
      case 'open-add-fixed': {
        const maxMeals = store.getConfig().plannedMealsPerDay || 4;
        if (store.getDay().meals.length >= maxMeals) {
          return toast(`Daily limit of ${maxMeals} meals reached`, 'warning');
        }
        addFixedModal.open();
        break;
      }
      case 'open-target':
        document.activeElement?.blur();
        targetModal.open();
        break;
      case 'reset-target':
        store.resetTargets();
        toast('Target restored to config.json', 'info');
        break;
      case 'reset-day':
        document.activeElement?.blur();
        if (confirm('Remove all meals and overrides for today?')) {
          store.resetDay();
          expanded.clear();
          toast('Day reset', 'info');
        }
        break;
      case 'export':
        document.activeElement?.blur();
        download(`slimbelly-${store.getDay().date}.json`, store.exportDay());
        break;
    }
  });

  // Day rollover (midnight, or app resumed the next day)
  const checkDate = () => {
    if (store.checkDate()) {
      expanded.clear();
      toast('A new day has started 🌅', 'info');
    }
  };
  setInterval(checkDate, 60_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkDate());

  render();
}

main().catch((e) => {
  console.error(e);
  showFatal('Unexpected error', [e.message]);
});

