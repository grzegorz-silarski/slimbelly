// Toast notifications (daisyUI toast + alert).

import { escapeHtml } from './format.js';

const TYPE_CLASS = { info: 'alert-info', success: 'alert-success', warning: 'alert-warning', error: 'alert-error' };

const MAX_VISIBLE = 2;

export function toast(message, type = 'info', timeout = 3500) {
  const container = document.getElementById('toasts');
  if (!container) return;
  while (container.children.length >= MAX_VISIBLE) container.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = `alert ${TYPE_CLASS[type] || TYPE_CLASS.info} shadow-md text-sm py-2 transition-opacity duration-300`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, timeout);
}
