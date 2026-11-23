// The category tabs: a tab row on desktop and a dropdown on phones (CSS shows one of them). The elements are created
// once from the manifest; after that only their state is updated, so keyboard focus is never lost.
import { escapeHtml } from './text.js?v=a8a25cf21f';
import { tabIsEmpty } from './columns.js?v=a8a25cf21f';

// `idPrefix` keeps the button ids unique when a second tab row exists (the player tile has its own).
export function buildTabs(tabsRow, tabSelect, tabs, idPrefix) {
  tabsRow.innerHTML = tabs.map((tab, index) =>
    `<button type="button" role="tab" id="${idPrefix}-${index}" class="tab" data-tab="${escapeHtml(tab.name)}"></button>`).join('');
  tabSelect.innerHTML = tabs.map((tab) => `<option value="${escapeHtml(tab.name)}"></option>`).join('');
}

// Arrow keys move between the tabs of a row (only the active tab is in the Tab order).
export function wireTabKeys(tabsRow, tabs, getActiveName, selectTab) {
  tabsRow.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.name === getActiveName());
    const next = (index + step + tabs.length) % tabs.length;
    selectTab(tabs[next].name);
    tabsRow.children[next].focus();
  });
}

// Marks the active tab and the tabs with no data in this season ("Explain"): they stay in the bar but are dimmed.
export function updateTabs(tabsRow, tabSelect, tabs, activeName, emptyKeys) {
  tabs.forEach((tab, index) => {
    const isActive = tab.name === activeName;
    const isEmpty = tabIsEmpty(tab, emptyKeys);
    const button = tabsRow.children[index];
    button.className = `tab${isActive ? ' is-active' : ''}${isEmpty ? ' is-empty' : ''}`;
    button.setAttribute('aria-selected', String(isActive));
    button.tabIndex = isActive ? 0 : -1;   // roving tabindex: Tab reaches the active tab, arrows move between tabs
    button.innerHTML = escapeHtml(tab.name) + (isEmpty
      ? '<span class="tab-flag" aria-hidden="true"> ∅</span><span class="sr-only"> (no data this season)</span>'
      : '');
    tabSelect.options[index].textContent = tab.name + (isEmpty ? ' ∅ (no data this season)' : '');
    if (isActive) button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  tabSelect.value = activeName;
}
