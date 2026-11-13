// Compare players. The selection is a Map of EntityId -> display name (the name is kept so a player can still be named in
// a season where they have no row). Everything here is a pure question about one season file; the page state lives in main.js.

// Row indexes of the selected players that have a row in this season.
export function rowsOfSelected(season, selected) {
  const rows = new Set();
  season.id.forEach((entityId, row) => { if (selected.has(entityId)) rows.add(row); });
  return rows;
}

// Names of the selected players that have no row in this season file.
export function namesNotInSeason(season, selected) {
  const present = new Set(season.id);
  return [...selected].filter(([entityId]) => !present.has(entityId)).map(([, name]) => name);
}
