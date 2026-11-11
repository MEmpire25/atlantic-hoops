// Messages shown in place of the table: loading, load error, no matching players, a tab with no data this season.
import { escapeHtml } from './text.js';

const SKELETON_ROWS = 10;

export function loadingHtml() {
  return `<div class="skeleton" aria-busy="true" aria-label="Loading">${'<i></i>'.repeat(SKELETON_ROWS)}</div>`;
}

export function errorHtml(fileName) {
  return `<div class="panel-msg is-error" role="alert"><h2>Could not load ${escapeHtml(fileName)}</h2>` +
    '<p>Check your connection and try again.</p><button type="button" class="btn" data-retry>Retry</button></div>';
}

export function noResultsHtml() {
  return '<div class="panel-msg"><h2>No players match these filters</h2><p>Loosen a filter, or reset them all.</p>' +
    '<button type="button" class="btn" data-reset>Reset filters</button></div>';
}

// `otherSeason` is the newest season with data for the tab, or undefined when there is none.
export function emptyTabHtml(tabName, seasonText, otherSeason) {
  const jump = otherSeason
    ? `<button type="button" class="btn" data-switch-season="${escapeHtml(otherSeason)}">Show ${escapeHtml(otherSeason)}</button>`
    : '';
  return `<div class="panel-msg"><h2>No ${escapeHtml(tabName)} data for ${escapeHtml(seasonText)}</h2>` +
    `<p>None of this tab’s columns are available for this season.</p>${jump}</div>`;
}
