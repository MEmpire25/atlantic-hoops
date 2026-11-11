// Ranks over the rows currently shown (not the whole season).

// Competition ranking (1, 2, 2, 4): tied values share the best rank of the tie. Blank values are not ranked and do not
// count. `direction` is the column's manifest rank: "higher" ranks high to low, "lower" ranks low to high, so rank 1
// is always the best value.
export function buildRankTable(values, shownRows, direction) {
  const present = [];
  for (const row of shownRows) {
    if (values[row] !== null) present.push(values[row]);
  }
  present.sort(direction === 'higher' ? (a, b) => b - a : (a, b) => a - b);

  const firstRankOfValue = new Map();
  present.forEach((value, position) => {
    if (!firstRankOfValue.has(value)) firstRankOfValue.set(value, position + 1);
  });
  return { total: present.length, firstRankOfValue };
}

// Rank of one value, or null when the value is blank.
export function lookupRank(rankTable, value) {
  return value === null ? null : rankTable.firstRankOfValue.get(value);
}

// Five color steps by position in the list: top 10%, next 20%, middle 40%, next 20%, bottom 10%.
export function colorStep(rank, total) {
  const position = total > 1 ? (rank - 1) / (total - 1) : 0;
  if (position <= 0.1) return 1;
  if (position <= 0.3) return 2;
  if (position <= 0.7) return 3;
  if (position <= 0.9) return 4;
  return 5;
}

// Rank tables for the given columns. Columns whose direction is "none" (and text columns) get no table, so they show
// no rank number at all.
export function buildRankTables(columns, season, shownRows) {
  const tables = new Map();
  for (const column of columns) {
    if (column.rank === 'none' || column.format === 'text') continue;
    tables.set(column.key, buildRankTable(season.cols[column.key], shownRows, column.rank));
  }
  return tables;
}
