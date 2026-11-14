// Wording that belongs to the Multi seasons mode. The owner approves this copy; the stats page and the
// glossary page both read it from here so the text exists once.

export const MULTI_NOTE_HTML = '<b>Multi method:</b> averages of single seasons, weighted by possessions — not recalculated on combined multi-year data. ' +
  'GP, MP and possessions are totals.';

// The Seasons column exists only in Multi mode, so the manifest and glossary files know nothing about it.
export const SEASONS_KEY = 'Seasons';
export const SEASONS_COLUMN = { key: SEASONS_KEY, name: 'Seasons', format: 'int', rank: 'none', source: '', signed: false, multi: 'special' };
export const MULTI_ANCHOR = 'multi-mode';   // id of the Multi text on the glossary page; index.html's switch tooltip links to the same anchor
export const SEASONS_ENTRY = {
  tooltip: 'How many of the ticked seasons the player qualified in (played enough minutes). Hover a count to see which ones.',
  link: `glossary.html#${MULTI_ANCHOR}`,
};

export const MULTI_GLOSSARY = {
  title: 'Multi mode',
  paragraphs: [
    'Multi combines several seasons into one table. Tick the seasons you want in the Season list and press Apply: every player gets one row.',
    'Rate and impact columns are averages of the player’s single seasons, giving more weight to seasons with more possessions. ' +
      'They are not recalculated on the combined years. GP, MP, possessions and shot counts are totals.',
    'A season only counts for a player if they played enough minutes in it (the same minimum as the single-season table). ' +
      'The Seasons column shows how many seasons counted; hover a number to see which ones.',
    'If a column has no value in some of a player’s seasons (for example tracking data in older years), the average uses the seasons that have one ' +
      'and the value is shown in italic. Position is the one the player played most often. Team and Age are not shown in Multi, because they change from season to season.',
    'Ranks and percentiles are worked out among the players shown.',
  ],
};
