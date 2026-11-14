// Column and tab helpers. The manifest is the single source of truth for labels, formats, tabs and rank directions,
// the glossary file for banner groups; nothing here lists columns by hand.

// Short tag shown under a credited column's header. The full source name is in the tag's tooltip and the footer.
const SOURCE_TAGS = {
  'Cleaning the Glass': 'CTG',
  'Ben Taylor (Thinking Basketball)': 'BT',
};

export function sourceTag(source) {
  return SOURCE_TAGS[source] ?? source;
}

export function indexColumnsByKey(manifest) {
  return new Map(manifest.columns.map((column) => [column.key, column]));
}

// key -> banner title, for the columns that sit under a banner (the "1-Year RAPM Measures" columns).
export function indexBannerTitles(glossary) {
  const titles = new Map();
  for (const group of glossary.groups) {
    for (const key of group.columns) titles.set(key, group.title);
  }
  return titles;
}

export function findTab(manifest, name) {
  return manifest.tabs.find((tab) => tab.name === name);
}

export function defaultPicks(tab) {
  return new Set(tab.columns.filter((column) => column.default_visible).map((column) => column.key));
}

// Columns with no value at all in these season files ("Explain": the tab or column is kept but marked as having no data).
// One season in single mode, every ticked season in Multi: a column is empty only if it is empty in all of them.
export function emptyColumnKeys(manifest, seasonType, seasonLabels) {
  const present = new Set(seasonLabels.flatMap((label) => manifest.non_empty_columns[seasonType][label]));
  const empty = new Set();
  for (const column of manifest.columns) {
    if (!present.has(column.key)) empty.add(column.key);
  }
  return empty;
}

export function tabIsEmpty(tab, emptyKeys) {
  return tab.columns.every((column) => emptyKeys.has(column.key));
}

// Newest season (of this type) in which the tab has at least one column with data, other than the current one.
export function newestSeasonWithData(manifest, tab, seasonType, currentSeason) {
  return manifest.seasons[seasonType].find((season) => {
    if (season === currentSeason) return false;
    const present = new Set(manifest.non_empty_columns[seasonType][season]);
    return tab.columns.some((column) => present.has(column.key));
  });
}

// The columns of a tab the visitor picked, split into those that can be shown and those left out because this
// season has no data for them. Order is the tab's order.
export function splitPickedColumns(tab, picks, emptyKeys) {
  const shownKeys = [];
  const leftOutKeys = [];
  for (const { key } of tab.columns) {
    if (!picks.has(key)) continue;
    (emptyKeys.has(key) ? leftOutKeys : shownKeys).push(key);
  }
  return { shownKeys, leftOutKeys };
}
