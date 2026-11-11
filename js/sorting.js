// Sorting the shown rows. Blank values are always last, in both directions. The sort is stable, so equal values keep
// their source order.

// First click on a header sorts best-first: text and "lower is better" columns ascending, everything else descending.
export function naturalSortDirection(column) {
  return column.format === 'text' || column.rank === 'lower' ? 'asc' : 'desc';
}

export function sortRows(shownRows, season, column, direction) {
  const values = season.cols[column.key];
  const isText = column.format === 'text';
  const sign = direction === 'asc' ? 1 : -1;

  return shownRows.slice().sort((rowA, rowB) => {
    const a = values[rowA];
    const b = values[rowB];
    if (a === null || b === null) return (a === null) - (b === null);
    return sign * (isText ? a.localeCompare(b) : a - b);
  });
}
