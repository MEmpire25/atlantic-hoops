// Column widths for the compact table.
//
// Each column is as wide as its widest value plus its number slot, or the width its header needs (the name on two lines
// at most, and the tools line below it), whichever is larger. The Player column is as wide as the longest name in the
// season file. If the columns together are narrower than the table box they are stretched evenly; if wider, the table scrolls sideways.
//
// Widths are measured on real hidden spans that use the table's own fonts, so nothing is guessed: digits are the same
// width in the table (tabular numbers), so every distinct value "shape" (digits replaced by 0) is measured once.
import { cellText, headerPieces } from './table.js?v=eeb1ada6db';
import { escapeHtml } from './text.js?v=eeb1ada6db';

const CANDIDATE_TEXT_LIMIT = 10;   // text columns: only the longest few strings can be the widest
const SAFETY_PIXELS = 1;           // absorbs sub-pixel rounding
const NO_HOVER = window.matchMedia('(hover: none)');   // keep in step with the @media (hover: none) rule in css/site.css

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

// Width of the number slot beside a value, for each digit count some column needs (a column's own widest number, see
// widestNumberDigits in ranks.js). In percentile mode the slot is a chip, so its padding is part of the width.
const MAX_RANK_DIGITS = 4;   // keep in step with the d1..d4 rules in css/site.css

function rankSlotWidths(view) {
  const digitCounts = Array.from({ length: MAX_RANK_DIGITS }, (unused, index) => index + 1);
  const digitsWidths = measureTexts(digitCounts.map((digits) => ({ text: '0'.repeat(digits), kind: 'rank' })));
  const extra = view.rankMode === 'percentile' ? 2 * cssPixels('--chip-pad') : 1;
  return new Map(digitCounts.map((digits, index) => [digits, Math.ceil(digitsWidths[index]) + extra]));
}

// Space between a value and its number.
function rankGap(view) {
  return cssPixels(view.rankMode === 'percentile' ? '--chip-gap' : '--rank-gap');
}

// Narrowest width at which a header name fits on two lines or fewer (the "i" button sits beside it when there is room, else
// below it, so it does not widen the column). Without this, a narrow number column would wrap a name like "PullUp 3PA/75" onto
// three lines and push its label out of line with its neighbours.
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

function naturalWidths(view, isPhone, rankSlots) {
  const cellPadding = 2 * cssPixels('--cell-pad-x');
  const entries = [];
  const owners = [];   // which column each measured value belongs to
  view.columns.forEach((column, index) => {
    for (const entry of valueCandidates(column, view)) { entries.push(entry); owners.push(index); }
  });

  const widestValue = view.columns.map(() => 0);
  measureTexts(entries).forEach((width, i) => { widestValue[owners[i]] = Math.max(widestValue[owners[i]], width); });
  const infoWidth = cssPixels('--info-size');

  const gap = rankGap(view);
  return view.columns.map((column, index) => {
    if (column.key === 'Player') {
      if (isPhone) return cssPixels('--player-width-phone');
      // Names get the full column; only on touch screens (no hover) the compare checkbox is always drawn and takes room.
      const padLeft = cssPixels(NO_HOVER.matches ? '--player-pad-left-pick' : '--player-pad-left');
      return Math.ceil(widestValue[index] + padLeft + cssPixels('--cell-pad-x') + SAFETY_PIXELS);
    }
    const valueWidth = widestValue[index] + (view.rankTables.has(column.key) ? gap + rankSlots.get(view.rankDigits.get(column.key)) : 0);
    return Math.ceil(Math.max(valueWidth, headerNameWidth(column.name), view.glossary.entries[column.key]?.tooltip ? infoWidth : 0) + cellPadding);
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
  const rankSlots = rankSlotWidths(view);
  rankSlots.forEach((width, digits) => grid.style.setProperty(`--rank-slot-${digits}`, `${width}px`));

  const widths = fitToBox(naturalWidths(view, isPhone, rankSlots), wrap.clientWidth - 1);
  cols.forEach((col, index) => { col.style.width = `${widths[index]}px`; });
  grid.style.width = `${widths.reduce((sum, width) => sum + width, 0)}px`;
}
