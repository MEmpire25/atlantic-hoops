// Loads the data files. Only the manifest, the glossary and the season being viewed are ever fetched (the player tile adds
// one player file, and one box file per column it draws), and each file is fetched once: later requests reuse the cached
// promise (player files are the one exception, see loadPlayer). URLs are relative so the site works from a sub-path
// (GitHub Pages project site).
import { normalizeForSearch } from './text.js?v=a8a25cf21f';

const cache = new Map();

function fetchJson(url) {
  return fetch(url).then((response) => {
    if (response.ok) return response.json();
    throw Object.assign(new Error(`Could not load ${url} (${response.status})`), { status: response.status });
  });
}

function fetchJsonOnce(url) {
  if (!cache.has(url)) {
    const request = fetchJson(url);
    // A failed load must not stay cached, or "Retry" would keep returning the same failure.
    request.catch(() => cache.delete(url));
    cache.set(url, request);
  }
  return cache.get(url);
}

export function loadManifest() {
  return fetchJsonOnce('data/manifest.json');
}

export function loadGlossary() {
  return fetchJsonOnce('data/glossary.json');
}

// A season file is {n, id, cols}. The searchable lower-case player names are added once here so typing in the
// search box does not normalize 450 names on every keystroke.
export async function loadSeason(seasonType, seasonLabel) {
  const file = await fetchJsonOnce(`data/${seasonType}/${seasonLabel}.json`);
  if (!file.searchNames) file.searchNames = file.cols.Player.map(normalizeForSearch);
  return file;
}

// One player's file (every season, with precomputed ranks), or null when there is no such player: an unknown id in a link.
// Ids are plain numbers, so anything else is refused here instead of being put into a URL. Only the latest player stays in
// memory: a file is up to 200 KB of JSON (several times that as objects) and a visitor can open hundreds of players; the
// browser's own HTTP cache makes opening one again quick.
let latestPlayer = null;   // { entityId, request }

export async function loadPlayer(entityId) {
  if (!/^\d+$/.test(entityId)) return null;
  if (latestPlayer?.entityId !== entityId) latestPlayer = { entityId, request: fetchJson(`data/players/${entityId}.json`) };
  try {
    return await latestPlayer.request;
  } catch (error) {
    if (latestPlayer?.entityId === entityId) latestPlayer = null;   // a failed load is not kept, so opening the player again retries
    if (error.status === 404) return null;
    throw error;
  }
}

// The box-plot numbers of one column for every season of a season type. File names replace characters that file names and
// URLs cannot hold, see the data contract ("TS%" is "TS~25").
export function loadBoxes(seasonType, columnKey) {
  const stem = columnKey.replace(/[^A-Za-z0-9_-]/g, (character) => `~${character.charCodeAt(0).toString(16).padStart(2, '0')}`);
  return fetchJsonOnce(`data/boxes/${seasonType}/${stem}.json`);
}

// Several season files at once (Multi mode), in the order asked for. One failed file fails the whole request.
export function loadSeasons(seasonType, seasonLabels) {
  return Promise.all(seasonLabels.map((label) => loadSeason(seasonType, label)));
}
