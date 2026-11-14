// The season checklist of Multi mode (a popover on desktop, a bottom sheet on phones): its rows and the label of the button
// that opens it. Pure text-building; main.js keeps the state and wires the clicks.
import { escapeHtml } from './text.js?v=5f3ae5be70';

// `allLabels`: every season of the site, newest first. `available`: the ones that exist for the chosen season type
// (playoffs have no 2026-27 yet). `draft`: the Set of labels currently ticked in the list, not yet applied.
export function checklistHtml(allLabels, available, draft) {
  return allLabels.map((label) => {
    const missing = !available.includes(label);
    const ticked = draft.has(label);
    const isLastTicked = ticked && draft.size === 1;   // at least one season must stay ticked
    return `<label class="sp-row${missing ? ' is-off' : ''}"${isLastTicked ? ' title="At least one season"' : ''}>` +
      `<input type="checkbox" data-season="${escapeHtml(label)}"${ticked ? ' checked' : ''}${missing || isLastTicked ? ' disabled' : ''}>` +
      `<span>${escapeHtml(label)}</span>${missing ? '<em>no playoffs</em>' : ''}</label>`;
  }).join('');
}

function isContiguous(available, ticked) {
  const positions = ticked.map((label) => available.indexOf(label)).sort((a, b) => a - b);
  return positions.every((position, index) => index === 0 || position === positions[index - 1] + 1);
}

// "2021-22 – 2024-25 (4)" when the ticked seasons follow each other, "2025-26 (1)" for one, else "3 seasons".
// `available` is newest first, `ticked` is newest first too.
export function seasonButtonLabel(available, ticked) {
  if (!isContiguous(available, ticked)) return `${ticked.length} seasons`;
  const span = ticked.length === 1 ? ticked[0] : `${ticked[ticked.length - 1]} – ${ticked[0]}`;
  return `${span} (${ticked.length})`;
}

// The seasons behind a "3 seasons" label, for its tooltip; null when the label already shows the span.
export function seasonButtonTip(available, ticked) {
  return isContiguous(available, ticked) ? null : `Ticked: ${ticked.join(', ')}`;
}
