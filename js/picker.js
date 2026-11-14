// The "Columns" picker of the active tab: one checkbox per column of the tab, defaults come from the manifest.
import { escapeHtml } from './text.js?v=5afac4d2e6';
import { sourceTag } from './columns.js?v=5afac4d2e6';

// Columns with no data this season are listed but disabled, so the visitor can see why they are missing.
export function pickerHtml(tab, picks, emptyKeys, columnsByKey, bannerTitles) {
  let html = '';
  let lastBanner = null;
  for (const { key } of tab.columns) {
    const column = columnsByKey.get(key);
    const banner = bannerTitles.get(key) ?? null;
    const isEmpty = emptyKeys.has(key);
    if (banner && banner !== lastBanner) html += `<div class="pk-group">${escapeHtml(banner)}</div>`;
    lastBanner = banner;
    html += `<label class="pk-item${isEmpty ? ' is-off' : ''}"><input type="checkbox" data-pick="${escapeHtml(key)}"` +
      `${picks.has(key) && !isEmpty ? ' checked' : ''}${isEmpty ? ' disabled' : ''}> <span>${escapeHtml(column.name)}</span>` +
      `${column.source ? ` <span class="pk-src" title="Source: ${escapeHtml(column.source)}">${escapeHtml(sourceTag(column.source))}</span>` : ''}` +
      `${isEmpty ? ' <em>no data this season</em>' : ''}</label>`;
  }
  return html;
}

// "Columns (11/23)": shown columns out of the tab's columns. Left-out empty columns do not count as shown.
export function pickerLabel(tab, picks, emptyKeys) {
  const shown = tab.columns.filter((column) => picks.has(column.key) && !emptyKeys.has(column.key)).length;
  return `Columns (${shown}/${tab.columns.length})`;
}
