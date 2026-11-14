// Turns the prepared view of the table into HTML. No state of its own: everything it needs is passed in `view`.
//
// view = {
//   columns:      manifest entries to show, in order (Player first),
//   season:       the loaded season file,
//   rows:         row indexes in display order,
//   rankTables:   Map key -> rank table (columns without one show no rank),
//   selected:     Map EntityId -> name of the players ticked for compare (their checkboxes are drawn checked),
//   rankMode:     'rank' or 'percentile': which number is shown beside each value,
//   rankDigits:   Map key -> digits of the widest number the column shows (the cell's d1..d4 class sizes its number slot),
//   sort:         { key, direction },
//   bannerTitles: Map key -> banner title (groups of columns, e.g. "1-Year RAPM Measures"),
//   glossary:     the glossary file (only its tooltips are used here, to decide where the "i" button goes)
// }
import { escapeHtml } from './text.js?v=b3e8ff2edc';
import { formatValue } from './format.js?v=b3e8ff2edc';
import { colorStep, shownNumber } from './ranks.js?v=b3e8ff2edc';
import { sourceTag } from './columns.js?v=b3e8ff2edc';

const BLANK_MARK = '–';

// Text of one cell, or null for a blank. Text columns are shown as stored.
export function cellText(season, row, column) {
  const value = season.cols[column.key][row];
  if (value === null) return null;
  return column.format === 'text' ? value : formatValue(value, column);
}

// A header name may wrap after a space, a capital letter that follows two lowercase letters, "/" or ":"
// ("OnORtg" -> "On" "ORtg"). The pieces keep their spaces, so joining them gives back the name. The column fitter
// measures the same pieces, so it must split names exactly like the header does.
export function headerPieces(name) {
  return name.replace(/([a-z]{2})(?=[A-Z])|[/:]|\s/g, (breakPoint) => `${breakPoint}\u0000`).split('\u0000').filter((piece) => piece !== '');
}

function headerNameHtml(name) {
  return headerPieces(name).map(escapeHtml).join('<wbr>');
}

// Source tag under a third-party column's header. When any shown column has one, the others get an empty tag line, so
// all names and tools lines in the row line up.
function creditTagHtml(column, view) {
  if (column.source) {
    return `<span class="credit-tag" title="Source: ${escapeHtml(column.source)}">${escapeHtml(sourceTag(column.source))}</span>`;
  }
  return view.columns.some((shown) => shown.source) ? '<span class="credit-tag" aria-hidden="true">&nbsp;</span>' : '';
}

function headerCellHtml(column, view) {
  const isSorted = view.sort.key === column.key;
  const ariaSort = isSorted ? (view.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
  const classes = [column.format === 'text' ? 'txt' : '', column.key === 'Player' ? 'player' : ''].join(' ');
  const hasTooltip = view.glossary.entries[column.key]?.tooltip;
  const infoButton = hasTooltip
    ? `<button type="button" class="info" data-info="${escapeHtml(column.key)}" aria-label="About ${escapeHtml(column.name)}" aria-expanded="false">i</button>`
    : '';

  // The info button sits beside the name, at the bottom of its last line (a flex row, see .th-in). The
  // sort marker is drawn by CSS in the cell's top edge and takes no room, so sorting never changes how a header wraps,
  // and headers in a row line up at the bottom.
  return `<th scope="col" class="${classes}" data-key="${escapeHtml(column.key)}" aria-sort="${ariaSort}"><div class="th-in">` +
    `<button type="button" class="sort" data-sort="${escapeHtml(column.key)}">${headerNameHtml(column.name)}</button>${infoButton}</div>` +
    `${creditTagHtml(column, view)}</th>`;
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

function rankHtml(rankTable, value, mode) {
  const number = shownNumber(rankTable, value, mode);
  const title = mode === 'percentile' ? `Percentile ${number} (among ${rankTable.total})` : `Rank ${number} of ${rankTable.total}`;
  return `<span class="rank r${colorStep(rankTable, value, mode)}" title="${title}">${number}</span>`;
}

// The compare checkbox before a player's name. The label is the visible square and also carries the larger tap area.
function pickBoxHtml(row, name, view) {
  const entityId = view.season.id[row];
  const checked = view.selected.has(entityId) ? ' checked' : '';
  return `<label class="pick"><input type="checkbox" class="pick-input" data-id="${entityId}" aria-label="Select ${escapeHtml(name)} to compare"${checked}><span class="pick-box" aria-hidden="true"></span></label>`;
}

function cellHtml(row, column, view) {
  const value = view.season.cols[column.key][row];
  const sortedClass = view.sort.key === column.key ? ' is-sorted' : '';

  if (column.key === 'Player') {
    return `<th scope="row" class="player" title="${escapeHtml(value)}">${pickBoxHtml(row, value, view)}${escapeHtml(value)}</th>`;
  }
  if (column.format === 'text') {
    return `<td class="txt${sortedClass}">${value === null ? '' : escapeHtml(value)}</td>`;
  }
  if (value === null) {
    return `<td class="num blank${sortedClass}"><span class="value">${BLANK_MARK}</span></td>`;
  }
  const rankTable = view.rankTables.get(column.key);
  if (!rankTable) return `<td class="num${sortedClass}"><span class="value">${formatValue(value, column)}</span></td>`;
  return `<td class="num d${view.rankDigits.get(column.key)}${sortedClass}"><span class="value">${formatValue(value, column)}</span>` +
    `${rankHtml(rankTable, value, view.rankMode)}</td>`;
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
