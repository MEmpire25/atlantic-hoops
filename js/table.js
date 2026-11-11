// Turns the prepared view of the table into HTML. No state of its own: everything it needs is passed in `view`.
//
// view = {
//   columns:      manifest entries to show, in order (Player first),
//   season:       the loaded season file,
//   rows:         row indexes in display order,
//   rankTables:   Map key -> rank table (columns without one show no rank),
//   sort:         { key, direction },
//   bannerTitles: Map key -> banner title (groups of columns, e.g. "1-Year RAPM Measures"),
//   glossary:     the glossary file (only its tooltips are used here, to decide where the "i" button goes)
// }
import { escapeHtml } from './text.js';
import { formatValue } from './format.js';
import { colorStep, lookupRank } from './ranks.js';
import { sourceTag } from './columns.js';

const BLANK_MARK = '–';

// Text of one cell, or null for a blank. Text columns are shown as stored.
export function cellText(season, row, column) {
  const value = season.cols[column.key][row];
  if (value === null) return null;
  return column.format === 'text' ? value : formatValue(value, column);
}

// Header words may wrap at a capital letter, "/" or ":" ("OnORtg" -> "On" "ORtg"). The column fitter measures the
// longest of these words, so it must split names exactly like the header does.
const BREAK_POINTS = /([a-z]{2})([A-Z])|([/:])/g;

export function headerWords(name) {
  return name.replace(/([a-z]{2})([A-Z])/g, '$1 $2').replace(/([/:])/g, '$1 ').split(/\s+/);
}

function headerNameHtml(name) {
  return escapeHtml(name).replace(BREAK_POINTS, (match, before, after, separator) => (
    separator ? `${separator}<wbr>` : `${before}<wbr>${after}`
  ));
}

function headerCellHtml(column, view) {
  const isSorted = view.sort.key === column.key;
  const ariaSort = isSorted ? (view.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
  const classes = [column.format === 'text' ? 'txt' : '', column.key === 'Player' ? 'player' : ''].join(' ');
  const hasTooltip = view.glossary.entries[column.key]?.tooltip;
  const infoButton = hasTooltip
    ? `<button type="button" class="info" data-info="${escapeHtml(column.key)}" aria-label="About ${escapeHtml(column.name)}" aria-expanded="false">i</button>`
    : '';
  const creditTag = column.source
    ? `<span class="credit-tag" title="Source: ${escapeHtml(column.source)}">${escapeHtml(sourceTag(column.source))}</span>`
    : '';

  return `<th scope="col" class="${classes}" data-key="${escapeHtml(column.key)}" aria-sort="${ariaSort}"><div class="th-in">` +
    `<button type="button" class="sort" data-sort="${escapeHtml(column.key)}">${headerNameHtml(column.name)}<span class="arrow" aria-hidden="true"></span></button>` +
    `${infoButton}</div>${creditTag}</th>`;
}

// Banner row above runs of grouped columns. The frozen Player cell must stay a single cell, so a blank run that
// starts at the first column is split in two.
function bannerRowHtml(view) {
  const titleOf = (column) => view.bannerTitles.get(column.key) ?? null;
  if (!view.columns.some((column) => titleOf(column))) return '';

  let cells = '';
  let start = 0;
  while (start < view.columns.length) {
    const title = titleOf(view.columns[start]);
    let end = start;
    while (end < view.columns.length && titleOf(view.columns[end]) === title) end++;
    const span = end - start;

    if (title) {
      cells += `<th scope="colgroup" class="group" colspan="${span}">${escapeHtml(title)}</th>`;
    } else if (start === 0) {
      cells += '<th class="group-blank player"></th>';
      if (span > 1) cells += `<th class="group-blank" colspan="${span - 1}"></th>`;
    } else {
      cells += `<th class="group-blank" colspan="${span}"></th>`;
    }
    start = end;
  }
  return `<tr>${cells}</tr>`;
}

function rankHtml(rankTable, value) {
  const rank = lookupRank(rankTable, value);
  return `<span class="rank r${colorStep(rank, rankTable.total)}" title="Rank ${rank} of ${rankTable.total} shown">${rank}</span>`;
}

function cellHtml(row, column, view) {
  const value = view.season.cols[column.key][row];
  const sortedClass = view.sort.key === column.key ? ' is-sorted' : '';

  if (column.key === 'Player') {
    return `<th scope="row" class="player" title="${escapeHtml(value)}">${escapeHtml(value)}</th>`;
  }
  if (column.format === 'text') {
    return `<td class="txt${sortedClass}">${value === null ? '' : escapeHtml(value)}</td>`;
  }
  if (value === null) {
    return `<td class="num blank${sortedClass}"><span class="value">${BLANK_MARK}</span></td>`;
  }
  const rankTable = view.rankTables.get(column.key);
  return `<td class="num${sortedClass}"><span class="value">${formatValue(value, column)}</span>` +
    `${rankTable ? rankHtml(rankTable, value) : ''}</td>`;
}

export function tableHtml(view) {
  const colgroup = `<colgroup>${view.columns.map(() => '<col>').join('')}</colgroup>`;
  const bannerRow = bannerRowHtml(view);
  const headerRow = `<tr>${view.columns.map((column) => headerCellHtml(column, view)).join('')}</tr>`;
  const bodyRows = view.rows
    .map((row) => `<tr>${view.columns.map((column) => cellHtml(row, column, view)).join('')}</tr>`)
    .join('');
  return { hasBanner: bannerRow !== '', html: `${colgroup}<thead>${bannerRow}${headerRow}</thead><tbody>${bodyRows}</tbody>` };
}
