// Header tooltip. Opens on hover or keyboard focus of a header; the small "i" button (click or Enter) pins it and moves
// focus to its glossary link. Esc closes it and returns focus to the button.
import { escapeHtml, glossaryLink } from './text.js?v=5afac4d2e6';

const HIDE_DELAY_MS = 180;   // lets the pointer travel from the header to the tooltip without it closing

// `describeColumn(key)` returns { column, tooltip } for the column; the caller knows the manifest and the glossary,
// this module only handles showing and hiding.
export function setUpTooltip(tipElement, grid, describeColumn) {
  let pinnedKey = null;
  let shownKey = null;
  let hideTimer = null;
  let ignoreFocus = false;

  function contentHtml(key) {
    const { column, tooltip } = describeColumn(key);
    return `<div class="tip-title">${escapeHtml(column.name)}</div><p>${escapeHtml(tooltip)}</p>` +
      (column.source ? `<p>Source: ${escapeHtml(column.source)}</p>` : '') +
      `<a class="tip-link" href="${glossaryLink(key)}">Glossary &rarr;</a>`;
  }

  function markPinnedButton() {
    for (const button of grid.querySelectorAll('.info')) {
      button.setAttribute('aria-expanded', String(button.dataset.info === pinnedKey));
    }
  }

  function show(key, headerCell, pin) {
    clearTimeout(hideTimer);
    shownKey = key;
    pinnedKey = pin ? key : null;
    tipElement.innerHTML = contentHtml(key);
    tipElement.hidden = false;

    const anchor = headerCell.getBoundingClientRect();
    const width = tipElement.offsetWidth;
    const height = tipElement.offsetHeight;
    const below = anchor.bottom + 6;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, anchor.top - height - 6) : below;
    tipElement.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
    tipElement.style.top = `${top}px`;
    markPinnedButton();
  }

  function hide(force) {
    if (pinnedKey && !force) return;
    tipElement.hidden = true;
    pinnedKey = null;
    shownKey = null;
    markPinnedButton();
  }

  function hideSoon() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hide(false), HIDE_DELAY_MS);
  }

  const headerWithInfo = (target) => {
    const cell = target.closest('th[data-key]');
    return cell && cell.querySelector('.info') ? cell : null;
  };

  grid.addEventListener('mouseover', (event) => {
    const cell = headerWithInfo(event.target);
    if (cell && !pinnedKey) show(cell.dataset.key, cell, false);
  });
  grid.addEventListener('mouseout', (event) => {
    if (event.target.closest('th[data-key]') && !pinnedKey) hideSoon();
  });
  grid.addEventListener('focusin', (event) => {
    const cell = headerWithInfo(event.target);
    if (cell && event.target.closest('.sort, .info') && !pinnedKey && !ignoreFocus) show(cell.dataset.key, cell, false);
  });
  grid.addEventListener('focusout', () => { if (!pinnedKey) hideSoon(); });
  tipElement.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  tipElement.addEventListener('mouseleave', () => { if (!pinnedKey) hideSoon(); });

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('.info');
    if (!button) return;
    const key = button.dataset.info;
    if (pinnedKey === key) {
      hide(true);
    } else {
      show(key, button.closest('th'), true);
      tipElement.querySelector('.tip-link').focus();
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#tip, .info')) hide(true);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || tipElement.hidden) return;
    const wasPinned = pinnedKey !== null;
    const key = shownKey;
    hide(true);
    if (!wasPinned) return;
    // Focus goes back to the button that opened the tooltip, without the focus handler reopening it.
    ignoreFocus = true;
    grid.querySelector(`.info[data-info="${CSS.escape(key)}"]`)?.focus();
    ignoreFocus = false;
  });

  return { hide: () => hide(true) };
}
