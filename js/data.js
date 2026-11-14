// Loads the data files. Only the manifest, the glossary and the season being viewed are ever fetched, and each file is
// fetched once: later requests reuse the cached promise. URLs are relative so the site works from a sub-path
// (GitHub Pages project site).
import { normalizeForSearch } from './text.js?v=eeb1ada6db';

const cache = new Map();

function fetchJsonOnce(url) {
  if (!cache.has(url)) {
    const request = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
      return response.json();
    });
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
