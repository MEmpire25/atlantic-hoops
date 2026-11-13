// Ranks and percentiles over the rank pool (the rows shown, or the default view while a name is searched; see main.js).
//
// For one column the pool's values are sorted best first, so a value's position is the number of better values:
//   rank       = 1 + number of pool values strictly better (competition ranking: 1, 2, 2, 4; ties share the best rank)
//   percentile = floor(100 * W / (N - 1)), W = number of pool values strictly worse, N = number of values; 100 if N is 1.
//                Rounded down so "97" never claims more than was earned and the legend bands match the colors exactly.
// Blank values are not ranked and do not count. `direction` is the column's manifest rank: "higher" puts the highest
// value first, "lower" the lowest, so rank 1 and percentile 100 are always the best value.
export function buildRankTable(values, poolRows, direction) {
  const present = [];
  for (const row of poolRows) {
    if (values[row] !== null) present.push(values[row]);
  }
  present.sort(direction === 'higher' ? (a, b) => b - a : (a, b) => a - b);

  const firstRankOfValue = new Map();
  const lastPositionOfValue = new Map();
  present.forEach((value, position) => {
    if (!firstRankOfValue.has(value)) firstRankOfValue.set(value, position + 1);
    lastPositionOfValue.set(value, position);
  });
  return { total: present.length, firstRankOfValue, lastPositionOfValue, bestValue: present[0], worstValue: present[present.length - 1] };
}

// Rank of one value, or null when the value is blank.
export function lookupRank(rankTable, value) {
  return value === null ? null : rankTable.firstRankOfValue.get(value);
}

// Percentile of one value, or null when the value is blank.
export function lookupPercentile(rankTable, value) {
  if (value === null) return null;
  if (rankTable.total < 2) return 100;
  const worse = rankTable.total - 1 - rankTable.lastPositionOfValue.get(value);
  return Math.floor((100 * worse) / (rankTable.total - 1));
}

// The number shown beside a value: its rank, or its percentile in percentile mode.
export function shownNumber(rankTable, value, mode) {
  return mode === 'percentile' ? lookupPercentile(rankTable, value) : lookupRank(rankTable, value);
}

// Five color steps. Rank mode: by position in the list (top 10%, next 20%, middle 40%, next 20%, bottom 10%).
// Percentile mode: the same cut points on the percentile (90, 70, 30, 10), so the legend's ranges are exact.
function rankColorStep(rank, total) {
  const position = total > 1 ? (rank - 1) / (total - 1) : 0;
  if (position <= 0.1) return 1;
  if (position <= 0.3) return 2;
  if (position <= 0.7) return 3;
  if (position <= 0.9) return 4;
  return 5;
}

function percentileColorStep(percentile) {
  if (percentile >= 90) return 1;
  if (percentile >= 70) return 2;
  if (percentile >= 30) return 3;
  if (percentile >= 10) return 4;
  return 5;
}

export function colorStep(rankTable, value, mode) {
  return mode === 'percentile'
    ? percentileColorStep(lookupPercentile(rankTable, value))
    : rankColorStep(lookupRank(rankTable, value), rankTable.total);
}

// Digits of the widest number a column can show in this mode (its largest rank, or its highest percentile). The column
// fitter sizes the number's slot from this, so a column that never reaches 100 does not reserve room for three digits.
export function widestNumberDigits(rankTable, mode) {
  if (rankTable.total === 0) return 1;   // an empty pool shows no numbers at all
  const widest = mode === 'percentile'
    ? lookupPercentile(rankTable, rankTable.bestValue)
    : lookupRank(rankTable, rankTable.worstValue);
  return String(widest).length;
}

// Rank tables for the given columns. Columns whose direction is "none" (and text columns) get no table, so they show
// no number at all.
export function buildRankTables(columns, season, poolRows) {
  const tables = new Map();
  for (const column of columns) {
    if (column.rank === 'none' || column.format === 'text') continue;
    tables.set(column.key, buildRankTable(season.cols[column.key], poolRows, column.rank));
  }
  return tables;
}
