// Multi seasons mode: turns several season files into one table of one row per player.
//
//   season files -> keep each player's qualifying seasons -> one aggregated value per column -> a "season-like" object
//
// The result has the same shape as a single season file ({n, id, cols, searchNames}), so filtering, ranks, sorting and the
// table work on it unchanged. Extra fields: `contributed` and `seasonLists` (for the cell tooltips) and `tickedCount`.
// How each column is combined comes from the manifest's per-column `multi` rule (approved by the owner):
//   sum = total over the seasons; w_total / w_off / w_def = average weighted by TotalPoss / OffPoss / DefPoss.
import { normalizeForSearch } from './text.js?v=5f3ae5be70';
import { SEASONS_KEY } from './multi-copy.js?v=5f3ae5be70';

const POSSESSION_COLUMN = { w_total: 'TotalPoss', w_off: 'OffPoss', w_def: 'DefPoss' };
const DECIMALS = { int: 0, '1dp': 1, pct1: 1, '2dp': 2 };   // display decimals of each column format (see format.js)

// Round half up, like the single-season export does. The decimal shift goes through the number's text, so a value
// such as 1.005 is rounded as the decimal it reads, not as the binary fraction behind it.
function roundHalfUp(value, decimals) {
  const [mantissa, exponent = '0'] = String(Math.abs(value)).split('e');
  const rounded = Number(`${Math.round(Number(`${mantissa}e${Number(exponent) + decimals}`))}e${-decimals}`);
  return value < 0 && rounded !== 0 ? -rounded : rounded;
}

// Each player's qualifying seasons, oldest first: a season counts if MP reaches that season's floor.
// `loaded` is [{label, file}] sorted oldest first. Returns [{ entityId, seasons: [{label, cols, row}] }].
function qualifyingSeasonsByPlayer(loaded, floors) {
  const byPlayer = new Map();
  for (const { label, file } of loaded) {
    file.id.forEach((entityId, row) => {
      if (file.cols.MP[row] < floors[label]) return;
      if (!byPlayer.has(entityId)) byPlayer.set(entityId, { entityId, seasons: [] });
      byPlayer.get(entityId).seasons.push({ label, cols: file.cols, row });
    });
  }
  return [...byPlayer.values()];
}

// The position played in most of the player's seasons; a tie goes to the most recent of the tied positions.
function mostCommonPosition(seasons) {
  const counts = new Map();
  for (const { cols, row } of seasons) counts.set(cols.Pos[row], (counts.get(cols.Pos[row]) ?? 0) + 1);
  const best = Math.max(...counts.values());
  for (let index = seasons.length - 1; index >= 0; index--) {
    const position = seasons[index].cols.Pos[seasons[index].row];
    if (counts.get(position) === best) return position;
  }
}

// One column for all players: the aggregated values (rounded for display) and, per player, how many seasons had a value.
function aggregateColumn(players, column) {
  const possessionKey = POSSESSION_COLUMN[column.multi];
  const values = [];
  const contributed = new Uint8Array(players.length);

  players.forEach((player, index) => {
    let total = 0;
    let possessionTotal = 0;
    for (const { cols, row } of player.seasons) {
      const value = cols[column.key][row];
      if (value === null) continue;   // this season has no value: it leaves the average (or total) out
      contributed[index]++;
      if (possessionKey) {
        const possessions = cols[possessionKey][row];
        total += value * possessions;
        possessionTotal += possessions;
      } else {
        total += value;
      }
    }
    if (contributed[index] === 0) values.push(null);
    else values.push(roundHalfUp(possessionKey ? total / possessionTotal : total, DECIMALS[column.format]));
  });
  return { values, contributed };
}

// `loaded` is [{label, file}] in any order; `tickedCount` is how many seasons the visitor ticked (some may add no player).
export function aggregateSeasons(manifest, seasonType, loaded) {
  const oldestFirst = [...loaded].sort((a, b) => a.label.localeCompare(b.label));
  const players = qualifyingSeasonsByPlayer(oldestFirst, manifest.min_mp[seasonType]);
  const newestSeason = (player) => player.seasons[player.seasons.length - 1];

  const cols = {
    Player: players.map((player) => newestSeason(player).cols.Player[newestSeason(player).row]),
    Pos: players.map((player) => mostCommonPosition(player.seasons)),
    [SEASONS_KEY]: players.map((player) => player.seasons.length),
  };
  const contributed = new Map();
  for (const column of manifest.columns) {
    if (column.multi !== 'sum' && !(column.multi in POSSESSION_COLUMN)) continue;
    const aggregated = aggregateColumn(players, column);
    cols[column.key] = aggregated.values;
    contributed.set(column.key, aggregated.contributed);
  }

  return {
    n: players.length,
    id: players.map((player) => player.entityId),
    cols,
    searchNames: cols.Player.map(normalizeForSearch),
    contributed,
    seasonLists: players.map((player) => player.seasons.map((entry) => entry.label).reverse()),   // newest first
    tickedCount: loaded.length,
  };
}

// Tooltip of one cell of an aggregated table, or null when it needs none. `fewer` is true for a value built from fewer
// seasons than the player qualified in; the table shows those muted and in italic.
export function multiCellNote(season, column, row) {
  const seasonCount = season.cols[SEASONS_KEY][row];
  if (column.key === SEASONS_KEY) {
    const list = season.seasonLists[row];
    const span = list.length > 1 ? ` Span ${list[list.length - 1]} – ${list[0]}.` : '';
    return { fewer: false, text: `Qualified in ${seasonCount} of ${season.tickedCount} ticked seasons: ${list.join(', ')}.${span}` };
  }
  const used = season.contributed.get(column.key)?.[row];
  if (used === undefined || used === 0 || used === seasonCount) return null;
  const kind = column.multi === 'sum' ? 'Total' : 'Average';
  return { fewer: true, text: `${kind} of ${used} of ${seasonCount} seasons: the others have no value for this column.` };
}
