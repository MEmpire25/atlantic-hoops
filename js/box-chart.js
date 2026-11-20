// The player tile's chart: one box plot per season (the league that season), with the player's own value marked.
// Hand-drawn SVG, no chart library: the quartiles, whiskers and outliers arrive precomputed in the box files, so nothing
// is calculated here except where to put things on the screen. Colors come from css variables, so both themes work.
//
// Wide screens draw boxes standing up, one column per season, time running left to right. On a phone every season is a
// horizontal row instead, newest first, so all seasons are reached by the page's normal vertical scroll.
//
// entry = {                       one per season from the player's first to last season of the type, oldest first
//   season:    '2024-25',
//   live:      true while the season is being played,
//   box:       { q1, med, q3, lo, hi, out } or null when nobody has a value that season,
//   hasRow:    whether the player has a row that season (a season in the middle of a career can have none),
//   marker:    null, or { value, rank, percentile, number, step }: the player's value, and the rank or percentile to show
//              (`number`, colored by `step`) which is null for columns without a rank direction,
// }
import { formatValue } from './format.js?v=19dd9c9ac6';
import { escapeHtml } from './text.js?v=19dd9c9ac6';
import { IN_PROGRESS_LABEL } from './player-copy.js?v=19dd9c9ac6';

const MINUS = '−';
const FALLBACK_WIDTH = 600;
const AXIS_TICKS_WANTED = 5;
const FAR_OUTLIER_SHARE = 0.45;   // if the whiskers span less than this much of the full range, far outliers are clipped to edge arrows
const AXIS_PADDING_SHARE = 0.05;

// Standing boxes
const AXIS_WIDTH = 46;            // the value axis on the left stays put while the seasons scroll
const RIGHT_PADDING = 10;         // empty space after the newest season, so its label never touches the edge
const MIN_SLOT = 44;              // narrowest column of one season; the label above a marker needs this much
const MAX_SLOT = 72;
const PLOT_TOP = 54;              // room for the tallest label (35 above its marker) with a margin
const PLOT_BOTTOM = 44;           // season label and "in progress"
const PLOT_HEIGHT_MIN = 260;
const PLOT_HEIGHT_MAX = 340;
const PLOT_HEIGHT_SHARE = 0.38;   // of the window height, between the two limits above
const BOX_WIDTH_MAX = 24;
const BOX_WIDTH_SHARE = 0.46;     // of a season's slot
const SNAP_DELAY_MS = 140;

// Rows (phone)
const ROW_HEIGHT = 26;
const ROW_LABEL_WIDTH = 96;
// Row end, right to left: 4 px margin, chip column (28 px), 4 px gap, value column (50 px, right-aligned), 8 px gap, then the plot.
// The widest chip (3 digits, boxed) is 24 px and the widest value ("−100.0%") about 46 px, so nothing is clipped.
const ROW_END_MARGIN = 4;
const ROW_CHIP_WIDTH = 28;
const ROW_VALUE_WIDTH = 50;
const ROW_GAP = 4;
const ROW_PLOT_GAP = 8;
const ROW_PLOT_MIN_WIDTH = 60;
const ROW_BOX_HEIGHT = 12;

// Coordinates are written with one decimal: precise enough for the screen, short in the markup.
const px = (number) => number.toFixed(1);

// ---------- axis ----------
function niceTicks(min, max) {
  const rough = (max - min) / AXIS_TICKS_WANTED;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normal = rough / magnitude;
  const step = (normal < 1.5 ? 1 : normal < 3 ? 2 : normal < 7 ? 5 : 10) * magnitude;
  const ticks = [];
  for (let tick = Math.ceil(min / step - 1e-9) * step; tick <= max + 1e-9; tick += step) ticks.push(+tick.toFixed(10));
  return { ticks, step };
}

function tickLabel(tick, step, column) {
  const decimals = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step) - 1e-9));
  const digits = Math.abs(tick).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (tick < 0 ? MINUS : '') + digits + (column.format === 'pct1' ? '%' : '');
}

// The value range the chart shows. A few extreme outliers must not squash the boxes, so the range is cut near the
// whiskers and the far dots are drawn as small arrows at the edge. Null when there is nothing to draw.
function chartDomain(entries) {
  let whiskerMin = Infinity, whiskerMax = -Infinity, allMin = Infinity, allMax = -Infinity;
  const take = (value, isWhiskerOrMarker) => {
    if (isWhiskerOrMarker) { whiskerMin = Math.min(whiskerMin, value); whiskerMax = Math.max(whiskerMax, value); }
    allMin = Math.min(allMin, value);
    allMax = Math.max(allMax, value);
  };
  for (const { box, marker } of entries) {
    if (box) { take(box.lo, true); take(box.hi, true); box.out.forEach((value) => take(value, false)); }
    if (marker) take(marker.value, true);
  }
  if (!isFinite(whiskerMin)) return null;

  let min = allMin, max = allMax;
  const whiskerSpan = whiskerMax - whiskerMin;
  if (whiskerSpan > 0 && whiskerSpan / (allMax - allMin) < FAR_OUTLIER_SHARE) {
    min = Math.max(allMin, whiskerMin - whiskerSpan * 0.3);
    max = Math.min(allMax, whiskerMax + whiskerSpan * 0.3);
  }
  if (max === min) { max += 1; min -= 1; }
  const padding = (max - min) * AXIS_PADDING_SHARE;
  min -= padding;
  max += padding;
  return { min, max, ...niceTicks(min, max) };
}

// ---------- pieces shared by both orientations ----------
function tipText(entry, column) {
  const live = entry.live ? ` (${IN_PROGRESS_LABEL})` : '';
  let marker;
  if (entry.marker) {
    marker = formatValue(entry.marker.value, column);
    if (entry.marker.number !== null) marker += `, rank ${entry.marker.rank}, percentile ${entry.marker.percentile}`;
  } else {
    marker = entry.hasRow ? 'no value' : 'no row (below the minutes floor)';
  }
  const { box } = entry;
  const league = box
    ? `. League median ${formatValue(box.med, column)}, middle half ${formatValue(box.q1, column)} to ${formatValue(box.q3, column)}`
    : '. No league data for this column';
  return `${entry.season}${live}: ${marker}${league}`;
}

// The rank or percentile as SVG: colored digits in rank mode, a boxed chip in percentile mode. `anchor` is 'middle' or 'start'.
function chipSvg(x, centerY, number, step, anchor, mode) {
  const width = Math.max(16, String(number).length * 6 + 6);
  const textY = (centerY + 3.3).toFixed(1);
  if (mode === 'percentile') {
    const left = anchor === 'middle' ? x - width / 2 : x;
    return `<rect class="chip-box cb${step}" x="${px(left)}" y="${px(centerY - 7)}" width="${width}" height="14" rx="3"/>` +
      `<text class="chip-num chip-num-boxed" x="${px(left + width / 2)}" y="${textY}" text-anchor="middle">${number}</text>`;
  }
  return `<text class="chip-num rk${step}" x="${px(x)}" y="${textY}" text-anchor="${anchor}">${number}</text>`;
}

function slotOpen(entry, column, x, y, width, height) {
  return `<g class="slot" data-season="${entry.season}"><rect class="band" x="${px(x)}" y="${px(y)}" width="${px(width)}" height="${px(height)}"/><title>${escapeHtml(tipText(entry, column))}</title>`;
}

function edgeArrowHtml(points) {
  return `<path class="bx-edge" d="M${points.map(([x, y]) => `${px(x)} ${px(y)}`).join('L')}Z"/>`;
}

// ---------- standing boxes ----------
function standingBoxHtml(box, centerX, y, boxWidth, live) {
  const cap = boxWidth * 0.5;
  return `<path class="bx-wh" d="M${centerX} ${px(y(box.hi))}V${px(y(box.q3))}M${centerX} ${px(y(box.q1))}V${px(y(box.lo))}` +
    `M${px(centerX - cap / 2)} ${px(y(box.hi))}h${cap}M${px(centerX - cap / 2)} ${px(y(box.lo))}h${cap}"/>` +
    `<rect class="bx-box${live ? ' bx-live' : ''}" x="${px(centerX - boxWidth / 2)}" y="${px(y(box.q3))}" width="${px(boxWidth)}" height="${px(Math.max(1, y(box.q1) - y(box.q3)))}"/>` +
    `<line class="bx-med" x1="${px(centerX - boxWidth / 2)}" x2="${px(centerX + boxWidth / 2)}" y1="${px(y(box.med))}" y2="${px(y(box.med))}"/>`;
}

function standingOutliersHtml(box, centerX, y, domain) {
  return box.out.map((value) => {
    if (value <= domain.max && value >= domain.min) return `<circle class="bx-out" cx="${px(centerX)}" cy="${px(y(value))}" r="1.8"/>`;
    const above = value > domain.max;
    const edgeY = y(above ? domain.max : domain.min);
    const tipDirection = above ? 5 : -5;
    return edgeArrowHtml([[centerX - 3, edgeY + tipDirection], [centerX + 3, edgeY + tipDirection], [centerX, edgeY]]);
  }).join('');
}

// The value and the rank above the player's marker.
function standingMarkerHtml(marker, centerX, y, slot, column, mode) {
  const markerY = y(marker.value);
  const valueText = formatValue(marker.value, column);
  const hasNumber = marker.number !== null;
  const tagWidth = Math.min(slot - 4, Math.max(valueText.length * 6, hasNumber ? String(marker.number).length * 6 + 10 : 0) + 10);
  const tagHeight = hasNumber ? 28 : 16;
  const tagTop = markerY - 7 - tagHeight;
  return `<circle class="mk" cx="${px(centerX)}" cy="${px(markerY)}" r="4.6"/>` +
    `<rect class="tag${hasNumber ? ` t${marker.step}` : ''}" x="${px(centerX - tagWidth / 2)}" y="${px(tagTop)}" width="${px(tagWidth)}" height="${tagHeight}" rx="3"/>` +
    `<text class="tv" x="${px(centerX)}" y="${px(tagTop + 11.5)}" text-anchor="middle">${escapeHtml(valueText)}</text>` +
    (hasNumber ? chipSvg(centerX, tagTop + tagHeight - 8, marker.number, marker.step, 'middle', mode) : '');
}

// Returns the markup and the width of one season's column (the caller snaps the scrolling to whole columns).
function standingChart(entries, domain, column, mode, width) {
  const count = entries.length;
  const widestLabel = Math.max(2, ...entries.map(({ marker }) => (marker ? formatValue(marker.value, column).length : 2)));
  const minSlot = Math.max(MIN_SLOT, widestLabel * 6 + 14);
  const available = width - AXIS_WIDTH - RIGHT_PADDING;
  let slot = Math.min(MAX_SLOT, Math.max(minSlot, available / count));
  // When the seasons do not all fit, stretch the slots so a whole number of them fills the view: the first visible season is never cut in half.
  if (slot * count > available + 0.5) slot = available / Math.floor(available / slot);

  const plotHeight = Math.round(Math.max(PLOT_HEIGHT_MIN, Math.min(PLOT_HEIGHT_MAX, window.innerHeight * PLOT_HEIGHT_SHARE)));
  const height = PLOT_TOP + plotHeight + PLOT_BOTTOM;
  const y = (value) => PLOT_TOP + plotHeight * (1 - (value - domain.min) / (domain.max - domain.min));
  const boxWidth = Math.min(BOX_WIDTH_MAX, slot * BOX_WIDTH_SHARE);

  const axisLabels = domain.ticks.map((tick) => `<text class="ax" x="${AXIS_WIDTH - 6}" y="${px(y(tick) + 3)}" text-anchor="end">${tickLabel(tick, domain.step, column)}</text>`).join('');
  let seasons = domain.ticks.map((tick) => `<line class="grid" x1="0" x2="${slot * count}" y1="${px(y(tick))}" y2="${px(y(tick))}"/>`).join('');
  entries.forEach((entry, index) => {
    const centerX = index * slot + slot / 2;
    seasons += slotOpen(entry, column, index * slot, 0, slot, height);
    if (entry.box) seasons += standingBoxHtml(entry.box, centerX, y, boxWidth, entry.live) + standingOutliersHtml(entry.box, centerX, y, domain);
    if (entry.marker) seasons += standingMarkerHtml(entry.marker, centerX, y, slot, column, mode);
    seasons += `<text class="ax" x="${px(centerX)}" y="${height - 24}" text-anchor="middle">${entry.season.slice(2)}</text>`;
    // "in progress" is wider than a slot, so it ends at the slot's right edge and runs left over empty space (it is always the newest season)
    if (entry.live) seasons += `<text class="live" x="${px((index + 1) * slot - 1)}" y="${height - 11}" text-anchor="end">${IN_PROGRESS_LABEL}</text>`;
    seasons += '</g>';
  });

  const html = `<div class="cv"><svg class="chart cv-axis" width="${AXIS_WIDTH}" height="${height}" aria-hidden="true">${axisLabels}</svg>` +
    `<div class="cv-scroll" tabindex="0" aria-label="Box plots by season (scrolls sideways)"><svg class="chart" width="${px(slot * count + RIGHT_PADDING)}" height="${height}" role="img" aria-label="Box plot of ${escapeHtml(column.name)} for each season">${seasons}</svg></div></div>` +
    '<p class="c-hint" hidden></p>';
  return { html, slot };
}

// Starts on the newest seasons, and after a scroll settles on a whole season, so no season is ever cut in half.
function settleScrolling(plot, slot, count) {
  const scroller = plot.querySelector('.cv-scroll');
  scroller.scrollLeft = scroller.scrollWidth;
  if (scroller.scrollWidth <= scroller.clientWidth + 1) return;
  let snapTimer;
  scroller.addEventListener('scroll', () => {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => scroller.scrollTo({ left: Math.round(scroller.scrollLeft / slot) * slot, behavior: 'smooth' }), SNAP_DELAY_MS);
  });
  const hint = plot.querySelector('.c-hint');
  hint.hidden = false;
  hint.textContent = `Showing the latest ${Math.round(scroller.clientWidth / slot)} of ${count} seasons. Swipe or scroll sideways for earlier seasons.`;
}

// ---------- rows (phone) ----------
function rowBoxHtml(box, centerY, x, domain, live) {
  let html = `<path class="bx-wh" d="M${px(x(box.lo))} ${centerY}H${px(x(box.q1))}M${px(x(box.q3))} ${centerY}H${px(x(box.hi))}M${px(x(box.lo))} ${centerY - 3}v6M${px(x(box.hi))} ${centerY - 3}v6"/>` +
    `<rect class="bx-box${live ? ' bx-live' : ''}" x="${px(x(box.q1))}" y="${centerY - ROW_BOX_HEIGHT / 2}" width="${px(Math.max(1, x(box.q3) - x(box.q1)))}" height="${ROW_BOX_HEIGHT}"/>` +
    `<line class="bx-med" x1="${px(x(box.med))}" x2="${px(x(box.med))}" y1="${centerY - ROW_BOX_HEIGHT / 2}" y2="${centerY + ROW_BOX_HEIGHT / 2}"/>`;
  for (const value of box.out) {
    if (value <= domain.max && value >= domain.min) {
      html += `<circle class="bx-out" cx="${px(x(value))}" cy="${centerY}" r="1.8"/>`;
    } else {
      const above = value > domain.max;
      const edgeX = x(above ? domain.max : domain.min);
      const tipDirection = above ? -5 : 5;
      html += edgeArrowHtml([[edgeX, centerY], [edgeX + tipDirection, centerY - 3], [edgeX + tipDirection, centerY + 3]]);
    }
  }
  return html;
}

function rowChart(entries, domain, column, mode, width) {
  const newestFirst = entries.slice().reverse();   // like the table
  const chipX = width - ROW_END_MARGIN - ROW_CHIP_WIDTH;
  const valueX = chipX - ROW_GAP;
  const plotLeft = ROW_LABEL_WIDTH;
  const plotRight = Math.max(plotLeft + ROW_PLOT_MIN_WIDTH, valueX - ROW_VALUE_WIDTH - ROW_PLOT_GAP);
  const x = (value) => plotLeft + (plotRight - plotLeft) * (value - domain.min) / (domain.max - domain.min);
  const height = newestFirst.length * ROW_HEIGHT;

  const columnHeads = `<text class="ax" x="${valueX}" y="12" text-anchor="end">Value</text>` +
    (column.rank === 'none' ? '' : `<text class="ax" x="${chipX}" y="12">${mode === 'percentile' ? 'Pctl' : 'Rank'}</text>`);
  const axis = `<svg class="chart ch-axis" width="${width}" height="20" aria-hidden="true">` +
    domain.ticks.map((tick) => `<text class="ax" x="${px(x(tick))}" y="12" text-anchor="middle">${tickLabel(tick, domain.step, column)}</text>`).join('') +
    `${columnHeads}<line class="grid" x1="0" x2="${width}" y1="19.5" y2="19.5"/></svg>`;

  let rows = domain.ticks.map((tick) => `<line class="grid" x1="${px(x(tick))}" x2="${px(x(tick))}" y1="0" y2="${height}"/>`).join('');
  newestFirst.forEach((entry, index) => {
    const centerY = index * ROW_HEIGHT + ROW_HEIGHT / 2;
    const live = entry.live ? `<tspan class="live" dx="5">${IN_PROGRESS_LABEL}</tspan>` : '';
    rows += slotOpen(entry, column, 0, index * ROW_HEIGHT, width, ROW_HEIGHT);
    rows += `<text class="ax" x="2" y="${px(centerY + 3.4)}">${entry.season.slice(2)}${live}</text>`;
    if (entry.box) rows += rowBoxHtml(entry.box, centerY, x, domain, entry.live);
    if (entry.marker) {
      rows += `<circle class="mk" cx="${px(x(entry.marker.value))}" cy="${centerY}" r="4.6"/>` +
        `<text class="tv" x="${valueX}" y="${px(centerY + 3.6)}" text-anchor="end">${escapeHtml(formatValue(entry.marker.value, column))}</text>`;
      if (entry.marker.number !== null) rows += chipSvg(chipX, centerY, entry.marker.number, entry.marker.step, 'start', mode);
    } else {
      rows += `<text class="gap" x="${valueX}" y="${px(centerY + 3.6)}" text-anchor="end">&ndash;</text>`;
    }
    rows += '</g>';
  });
  return `<div class="ch-scroll">${axis}<svg class="chart" width="${width}" height="${height}" role="img" aria-label="Box plot of ${escapeHtml(column.name)} for each season">${rows}</svg></div>`;
}

// ---------- drawing ----------
// Draws the chart into `plot`: the standing boxes, or the rows when `phone`. Returns false (and draws nothing) when no
// season has any value for the column.
export function drawBoxChart(plot, entries, column, { mode, phone }) {
  const domain = chartDomain(entries);
  if (!domain) return false;

  // A scrollbar that appears once the chart is drawn takes width: draw again at the width that is really left.
  const drawAt = (width) => {
    if (phone) {
      plot.innerHTML = rowChart(entries, domain, column, mode, width);
      return plot.querySelector('.ch-scroll').clientWidth;
    }
    const { html, slot } = standingChart(entries, domain, column, mode, width);
    plot.innerHTML = html;
    settleScrolling(plot, slot, entries.length);
    return Math.floor(plot.clientWidth);
  };
  const width = Math.floor(plot.clientWidth) || FALLBACK_WIDTH;
  const room = drawAt(width);
  if (room && room < width) drawAt(room);
  return true;
}

function keyIcon(shapes) {
  return `<svg viewBox="0 0 16 16" aria-hidden="true" class="chart">${shapes}</svg>`;
}

// What the shapes mean. `noRank` and `noLeagueSeasons` add a line when they apply.
export function chartKeyHtml({ noRank, noLeagueSeasons }) {
  return [
    `<span>${keyIcon('<rect class="bx-box" x="4" y="4" width="8" height="8"/><line class="bx-med" x1="4" x2="12" y1="8" y2="8"/>')}Box: middle half of players, line = median</span>`,
    `<span>${keyIcon('<path class="bx-wh" d="M8 1V4M8 12V15M5 1h6M5 15h6"/>')}Whiskers: 1.5&times;IQR</span>`,
    `<span>${keyIcon('<circle class="bx-out" cx="8" cy="8" r="2.4"/>')}Dots: outliers</span>`,
    `<span>${keyIcon('<circle class="mk" cx="8" cy="8" r="4.6"/>')}This player</span>`,
    `<span>${keyIcon('<rect class="bx-box bx-live" x="3" y="4" width="10" height="8"/>')}Dashed: season in progress</span>`,
    `<span>${keyIcon('<rect class="bx-box" x="3" y="4" width="10" height="8"/>')}Box without a marker: below the minutes floor</span>`,
    noRank ? '<span>No rank for this column: value only</span>' : '',
    noLeagueSeasons ? `<span>${noLeagueSeasons.count} of ${noLeagueSeasons.of} seasons have no league data for this column</span>` : '',
  ].join('');
}
