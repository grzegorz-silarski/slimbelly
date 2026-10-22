// Formatting + HTML helpers shared by UI modules.

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Amount without float noise / trailing zeros: 70 -> "70", 0.5 -> "0.5". */
export function fmtAmount(n) {
  return String(Number(Number(n).toFixed(2)));
}

export function fmtKcal(n) {
  return Math.round(n).toLocaleString();
}

/** Grams of macro: 1 decimal below 10 g, integer above. */
export function fmtG(n) {
  const v = Number(n) || 0;
  return Math.abs(v) < 10 ? v.toFixed(1).replace(/\.0$/, '') : String(Math.round(v));
}

export function fmtPct(n) {
  if (!Number.isFinite(n)) return '∞';
  const r = Math.round(n);
  return (r > 0 ? '+' : '') + r + '%';
}

export function macroLine(n) {
  return `P ${fmtG(n.protein)} · C ${fmtG(n.carbs)} · F ${fmtG(n.fat)}`;
}

export const MACROS = [
  { key: 'protein', label: 'Protein', short: 'P' },
  { key: 'carbs', label: 'Carbs', short: 'C' },
  { key: 'fat', label: 'Fat', short: 'F' },
];

export const STATUS_CLASS = {
  progress: { ok: 'progress-success', warn: 'progress-warning', bad: 'progress-error', neutral: 'progress-primary' },
  text: { ok: 'text-success', warn: 'text-warning', bad: 'text-error', neutral: 'text-primary' },
};

