// Messages shown in place of the table: loading, load error, no matching players, a tab with no data this season.
import { escapeHtml } from './text.js?v=5f3ae5be70';

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

// Multi mode: nobody has as many qualifying seasons as Min seasons asks for, but lowering it would show players.
export function noMinSeasonsHtml(minSeasons, tickedCount) {
  return `<div class="panel-msg"><h2>No players with ${minSeasons}+ seasons in this selection</h2>` +
    `<p>Only players who qualified in at least ${minSeasons} of the ${tickedCount} ticked seasons are shown.</p>` +
    '<button type="button" class="btn" data-fix-min-seasons>Lower Min seasons to 1+</button></div>';
}

// Multi mode: the old table stays on screen, dimmed, under one of these two messages.
export function busyHtml(seasonCount) {
  return `Loading ${seasonCount} season${seasonCount === 1 ? '' : 's'}…`;
}

export function busyErrorHtml() {
  return '<b>Could not load the seasons.</b><br>Check your connection. <button type="button" class="btn primary" data-retry>Retry</button>';
}

// `otherSeason` is the newest season with data for the tab, or undefined when there is none.
export function emptyTabHtml(tabName, seasonText, otherSeason) {
  const jump = otherSeason
    ? `<button type="button" class="btn" data-switch-season="${escapeHtml(otherSeason)}">Show ${escapeHtml(otherSeason)}</button>`
    : '';
  return `<div class="panel-msg"><h2>No ${escapeHtml(tabName)} data for ${escapeHtml(seasonText)}</h2>` +
    `<p>None of this tab’s columns are available for this season.</p>${jump}</div>`;
}
