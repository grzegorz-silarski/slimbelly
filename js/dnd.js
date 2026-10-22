// Drag & drop reordering via SortableJS (works with mouse and touch).

/**
 * @param {HTMLElement} listEl
 * @param {{ moveMeal: (from: number, to: number) => void }} store
 * @returns {boolean} whether drag & drop is active
 */
export function initDragAndDrop(listEl, store) {
  const Sortable = globalThis.Sortable;
  if (!Sortable) {
    console.warn('SortableJS not loaded – drag & drop disabled, use meal settings to reorder.');
    return false;
  }
  Sortable.create(listEl, {
    handle: '.drag-handle',
    draggable: '.meal-item',
    animation: 150,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    forceFallback: false,
    fallbackTolerance: 3,
    onEnd(evt) {
      if (evt.oldIndex == null || evt.newIndex == null || evt.oldIndex === evt.newIndex) return;
      store.moveMeal(evt.oldIndex, evt.newIndex);
    },
  });
  return true;
}

