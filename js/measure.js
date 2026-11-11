// Column widths for the compact table.
//
// Each column is as wide as its widest value plus its rank slot, or its longest header word, whichever is larger.
// If the columns together are narrower than the table box they are stretched evenly; if wider, the Player column
// shrinks first (down to its minimum) and only then does the table scroll sideways.
//
// Widths are measured on real hidden spans that use the table's own fonts, so nothing is guessed: digits are the same
// width in the table (tabular numbers), so every distinct value "shape" (digits replaced by 0) is measured once.
import { cellText, headerWords } from './table.js';
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
  const texts = [];
  for (const row of view.rows) {
    const text = cellText(view.season, row, column);
    if (text !== null) texts.push(text);
  }
  if (column.key === 'Player') return longestFirst(texts).map((text) => ({ text, kind: 'player' }));
  const chosen = column.format === 'text' ? longestFirst(texts) : distinctShapes(texts);
  return chosen.map((text) => ({ text, kind: 'value' }));
}

// Width of the rank number slot: the digits of the largest possible rank.
function rankSlotWidth(rowCount) {
  return Math.ceil(measureTexts([{ text: '0'.repeat(String(rowCount).length), kind: 'rank' }])[0]) + 1;
}

function naturalWidths(view, isPhone, rankSlot) {
  const cellPadding = 2 * cssPixels('--cell-pad-x');
  const entries = [];
  const owners = [];   // which column and which part (value or header) each measured entry belongs to
  view.columns.forEach((column, index) => {
    for (const entry of valueCandidates(column, view)) { entries.push(entry); owners.push({ index, part: 'value' }); }
    for (const word of headerWords(column.name)) { entries.push({ text: word, kind: 'head' }); owners.push({ index, part: 'head' }); }
  });

  const measured = measureTexts(entries);
  const widest = view.columns.map(() => ({ value: 0, head: 0 }));
  measured.forEach((width, i) => {
    const slot = widest[owners[i].index];
    slot[owners[i].part] = Math.max(slot[owners[i].part], width);
  });

  const rankExtra = cssPixels('--rank-gap') + rankSlot;
  return view.columns.map((column, index) => {
    if (column.key === 'Player') {
      if (isPhone) return cssPixels('--player-width-phone');
      const wanted = Math.ceil(widest[index].value + cssPixels('--player-pad-left') + cssPixels('--cell-pad-x') + SAFETY_PIXELS);
      return Math.min(cssPixels('--player-width-max'), Math.max(cssPixels('--player-width-min'), wanted));
    }
    const valueWidth = widest[index].value + (view.rankTables.has(column.key) ? rankExtra : 0);
    const headWidth = Math.min(cssPixels('--head-word-max'), widest[index].head);
    return Math.ceil(Math.max(valueWidth, headWidth) + cellPadding + SAFETY_PIXELS);
  });
}

function fitToBox(widths, availableWidth, isPhone) {
  let total = widths.reduce((sum, width) => sum + width, 0);
  if (total > availableWidth && !isPhone) {
    const shrink = Math.min(total - availableWidth, widths[0] - cssPixels('--player-width-min'));
    widths[0] -= shrink;
    total -= shrink;
  }
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
  const rankSlot = rankSlotWidth(view.rows.length);
  grid.style.setProperty('--rank-slot', `${rankSlot}px`);

  const widths = fitToBox(naturalWidths(view, isPhone, rankSlot), wrap.clientWidth - 1, isPhone);
  cols.forEach((col, index) => { col.style.width = `${widths[index]}px`; });
  grid.style.width = `${widths.reduce((sum, width) => sum + width, 0)}px`;
}
