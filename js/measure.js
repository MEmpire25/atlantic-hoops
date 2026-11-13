// Column widths for the compact table.
//
// Each column is as wide as its widest value plus its rank slot, or the width its header needs (the name on two lines
// at most, and the tools line below it), whichever is larger. The Player column is as wide as the longest name in the
// season file. If the columns together are narrower than the table box they are stretched evenly; if wider, the table scrolls sideways.
//
// Widths are measured on real hidden spans that use the table's own fonts, so nothing is guessed: digits are the same
// width in the table (tabular numbers), so every distinct value "shape" (digits replaced by 0) is measured once.
import { cellText, headerPieces } from './table.js';
import { escapeHtml } from './text.js';

const CANDIDATE_TEXT_LIMIT = 10;   // text columns: only the longest few strings can be the widest
const SAFETY_PIXELS = 1;           // absorbs sub-pixel rounding

function cssPixels(tokenName) {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(tokenName));
}

function measureHost() {
  let host = document.getElementById('measure-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'measure-host';
    host.className = 'measure-host';
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
  }
  return host;
}

// Widths in pixels of the given {text, kind} entries; `kind` picks the font class (value, player, head, rank).
function measureTexts(entries) {
  const host = measureHost();
  host.innerHTML = entries.map((entry) => `<span class="measure-${entry.kind}">${escapeHtml(entry.text)}</span>`).join('');
  return Array.from(host.children, (span) => span.getBoundingClientRect().width);
}

function longestFirst(texts) {
  return [...new Set(texts)].sort((a, b) => b.length - a.length).slice(0, CANDIDATE_TEXT_LIMIT);
}

function distinctShapes(texts) {
  return [...new Set(texts.map((text) => text.replace(/\d/g, '0')))];
}

// Texts that could be the widest in a column, with the font class to measure them in.
function valueCandidates(column, view) {
  // Every name in the season, not only the filtered rows: the column keeps its width while filtering, and the widest
  // name in pixels is not always the one with the most letters.
  if (column.key === 'Player') return [...new Set(view.season.cols.Player)].map((text) => ({ text, kind: 'player' }));

  const texts = [];
  for (const row of view.rows) {
    const text = cellText(view.season, row, column);
    if (text !== null) texts.push(text);
  }
  const chosen = column.format === 'text' ? longestFirst(texts) : distinctShapes(texts);
  return chosen.map((text) => ({ text, kind: 'value' }));
}

// Width of the rank number slot: the digits of the largest possible rank (the biggest rank pool among the columns).
function rankSlotWidth(view) {
  const poolSize = Math.max(0, ...Array.from(view.rankTables.values(), (rankTable) => rankTable.total));
  return Math.ceil(measureTexts([{ text: '0'.repeat(String(poolSize).length), kind: 'rank' }])[0]) + 1;
}

// Width of the tools line under a header name: the sort arrow's slot, a gap, and the "i" button. Both arrow glyphs
// have the same width.
function headerToolsWidth() {
  return measureTexts([{ text: '\u25B2', kind: 'rank' }])[0] + cssPixels('--sort-arrow-gap') + cssPixels('--info-size');
}

// Narrowest width at which a header name fits on two lines or fewer. Without this, a narrow number column would wrap
// a name like "PullUp 3PA/75" onto three lines and push its label out of line with its neighbours.
function headerNameWidth(name) {
  const pieces = headerPieces(name);
  const lines = [];   // for every place to break the name, the text of the first line and of the second line
  for (let split = 1; split <= pieces.length; split++) {
    lines.push({ text: pieces.slice(0, split).join('').trimEnd(), kind: 'head' }, { text: pieces.slice(split).join(''), kind: 'head' });
  }
  const widths = measureTexts(lines);

  let narrowest = Infinity;
  for (let split = 1; split <= pieces.length; split++) {
    narrowest = Math.min(narrowest, Math.max(widths[2 * (split - 1)], widths[2 * split - 1]));
  }
  return narrowest;
}

function naturalWidths(view, isPhone, rankSlot) {
  const cellPadding = 2 * cssPixels('--cell-pad-x');
  const entries = [];
  const owners = [];   // which column each measured value belongs to
  view.columns.forEach((column, index) => {
    for (const entry of valueCandidates(column, view)) { entries.push(entry); owners.push(index); }
  });

  const widestValue = view.columns.map(() => 0);
  measureTexts(entries).forEach((width, i) => { widestValue[owners[i]] = Math.max(widestValue[owners[i]], width); });
  const toolsWidth = headerToolsWidth();

  const rankExtra = cssPixels('--rank-gap') + rankSlot;
  return view.columns.map((column, index) => {
    if (column.key === 'Player') {
      if (isPhone) return cssPixels('--player-width-phone');
      return Math.ceil(widestValue[index] + cssPixels('--player-pad-left') + cssPixels('--cell-pad-x') + SAFETY_PIXELS);
    }
    const valueWidth = widestValue[index] + (view.rankTables.has(column.key) ? rankExtra : 0);
    return Math.ceil(Math.max(valueWidth, headerNameWidth(column.name), toolsWidth) + cellPadding);
  });
}

function fitToBox(widths, availableWidth) {
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total < availableWidth) {
    const stretch = (availableWidth - widths[0]) / (total - widths[0]);
    const stretched = widths.map((width, index) => (index === 0 ? width : Math.floor(width * stretch)));
    stretched[stretched.length - 1] += availableWidth - stretched.reduce((sum, width) => sum + width, 0);   // rounding leftover
    return stretched;
  }
  return widths;
}

// Writes the widths into the table's <col> elements. Safe to call again after a resize or when the web font arrives.
export function fitColumns(grid, wrap, view, isPhone) {
  const cols = grid.querySelectorAll('col');
  const rankSlot = rankSlotWidth(view);
  grid.style.setProperty('--rank-slot', `${rankSlot}px`);

  const widths = fitToBox(naturalWidths(view, isPhone, rankSlot), wrap.clientWidth - 1);
  cols.forEach((col, index) => { col.style.width = `${widths[index]}px`; });
  grid.style.width = `${widths.reduce((sum, width) => sum + width, 0)}px`;
}
