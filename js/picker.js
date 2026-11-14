// The "Columns" picker of the active tab: first the player-info columns (Team, Pos, ...; one choice shared by all tabs, no
// heading), a gap, then one checkbox per column of the tab. Defaults come from the manifest.
import { escapeHtml } from './text.js?v=0bb59059d4';
import { sourceTag } from './columns.js?v=0bb59059d4';

function infoItemHtml(column, infoPicks) {
  return `<label class="pk-item"><input type="checkbox" data-info-pick="${escapeHtml(column.key)}"${infoPicks.has(column.key) ? ' checked' : ''}> ` +
    `<span>${escapeHtml(column.name)}</span></label>`;
}

// Columns with no data this season are listed but disabled, so the visitor can see why they are missing.
export function pickerHtml(tab, picks, infoColumns, infoPicks, emptyKeys, columnsByKey, bannerTitles) {
  let html = infoColumns.map((column) => infoItemHtml(column, infoPicks)).join('') + '<div class="pk-gap"></div>';
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

// "Columns (11/23)": shown columns out of the tab's columns. Left-out empty columns do not count as shown. The player-info
// columns are not counted: the label is about the tab's own columns.
export function pickerLabel(tab, picks, emptyKeys) {
  const shown = tab.columns.filter((column) => picks.has(column.key) && !emptyKeys.has(column.key)).length;
  return `Columns (${shown}/${tab.columns.length})`;
}
