// HTML of the player tile's season table: one row per season of the player, the Season column frozen at the left.
// Like table.js it keeps no state; everything comes in through `view`.
//
// view = {
//   columns:          manifest entries to show, Season first,
//   block:            the player's regular-season or playoffs block of the player file ({ seasons, cols, rank, pct, of }),
//   rows:             indexes into the block's seasons, in display order,
//   sort:             { key, direction } or null,
//   mode:             'rank' or 'percentile': which number sits beside each value,
//   inProgressSeason: label of the season still being played, or null
// }
import { escapeHtml } from './text.js?v=19dd9c9ac6';
import { formatValue } from './format.js?v=19dd9c9ac6';
import { playerCellRanking } from './ranks.js?v=19dd9c9ac6';
import { BLANK_MARK, creditTagHtml, headerNameHtml, rankChipHtml } from './table.js?v=19dd9c9ac6';
import { IN_PROGRESS_LABEL } from './player-copy.js?v=19dd9c9ac6';

const SEASON_KEY = 'Season';

function headerCellHtml(column, view) {
  const isSorted = view.sort?.key === column.key;
  const ariaSort = isSorted ? (view.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
  const classes = column.key === SEASON_KEY ? 'season-col' : column.format === 'text' ? 'txt' : '';
  return `<th scope="col" class="${classes}" aria-sort="${ariaSort}"><div class="th-in">` +
    `<button type="button" class="sort" data-sort="${escapeHtml(column.key)}">${headerNameHtml(column.name)}</button></div>` +
    `${creditTagHtml(column, view)}</th>`;
}

// Digits of the widest rank (or percentile) a column shows, so its number slot lines up (the d1..d4 classes, see css).
function widestNumberDigits(view) {
  const digits = new Map();
  for (const column of view.columns) {
    const numbers = view.rows.flatMap((row) => playerCellRanking(view.block, column.key, row, view.mode)?.number ?? []);
    if (numbers.length > 0) digits.set(column.key, String(Math.max(...numbers)).length);
  }
  return digits;
}

function seasonCellHtml(season, view) {
  const live = season === view.inProgressSeason ? `<span class="live-tag">${IN_PROGRESS_LABEL}</span>` : '';
  return `<th scope="row" class="season-col">${escapeHtml(season)}${live}</th>`;
}

function cellHtml(row, column, view, rankDigits) {
  const value = view.block.cols[column.key][row];
  const sortedClass = view.sort?.key === column.key ? ' is-sorted' : '';
  if (column.format === 'text') return `<td class="txt${sortedClass}">${value === null ? '' : escapeHtml(value)}</td>`;
  if (value === null) return `<td class="num blank${sortedClass}"><span class="value">${BLANK_MARK}</span></td>`;

  const ranking = playerCellRanking(view.block, column.key, row, view.mode);
  const valueHtml = `<span class="value">${formatValue(value, column)}</span>`;
  if (!ranking) return `<td class="num${sortedClass}">${valueHtml}</td>`;
  return `<td class="num d${rankDigits.get(column.key)}${sortedClass}">${valueHtml}${rankChipHtml(ranking.number, ranking.step, ranking.total, view.mode)}</td>`;
}

export function playerTableHtml(view) {
  const otherColumns = view.columns.slice(1);   // the Season column is drawn by seasonCellHtml
  const rankDigits = widestNumberDigits(view);
  const headerRow = `<tr>${view.columns.map((column) => headerCellHtml(column, view)).join('')}</tr>`;
  const bodyRows = view.rows.map((row) =>
    `<tr>${seasonCellHtml(view.block.seasons[row], view)}${otherColumns.map((column) => cellHtml(row, column, view, rankDigits)).join('')}</tr>`).join('');
  return `<thead>${headerRow}</thead><tbody>${bodyRows}</tbody>`;
}
