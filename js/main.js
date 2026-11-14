// Stats page. The flow, top to bottom:
//   load data (data.js) -> apply filters (filters.js) -> compute ranks (ranks.js) -> sort (sorting.js) -> render (table.js)
// This file holds the page state and connects the controls to that flow.
import { loadManifest, loadGlossary, loadSeason, loadSeasons } from './data.js?v=5f3ae5be70';
import { emptyFilters, activeFilterNames, chipLabel, filterRows } from './filters.js?v=5f3ae5be70';
import { buildRankTable, buildRankTables, lookupRank, lookupPercentile, widestNumberDigits } from './ranks.js?v=5f3ae5be70';
import { naturalSortDirection, sortRows } from './sorting.js?v=5f3ae5be70';
import {
  indexColumnsByKey, indexBannerTitles, findTab, defaultPicks, emptyColumnKeys, tabIsEmpty,
  newestSeasonWithData, splitPickedColumns, sourceTag,
} from './columns.js?v=5f3ae5be70';
import { rowsOfSelected, namesNotInSeason } from './compare.js?v=5f3ae5be70';
import { tableHtml } from './table.js?v=5f3ae5be70';
import { fitColumns } from './measure.js?v=5f3ae5be70';
import { buildTabs, updateTabs } from './tabs.js?v=5f3ae5be70';
import { pickerHtml, pickerLabel } from './picker.js?v=5f3ae5be70';
import { loadingHtml, errorHtml, noResultsHtml, noMinSeasonsHtml, emptyTabHtml, busyHtml, busyErrorHtml } from './panels.js?v=5f3ae5be70';
import { setUpTooltip } from './tooltip.js?v=5f3ae5be70';
import { setUpHint } from './hint.js?v=5f3ae5be70';
import { aggregateSeasons } from './multi.js?v=5f3ae5be70';
import { MULTI_NOTE_HTML, SEASONS_KEY, SEASONS_COLUMN, SEASONS_ENTRY } from './multi-copy.js?v=5f3ae5be70';
import { checklistHtml, seasonButtonLabel, seasonButtonTip } from './season-list.js?v=5f3ae5be70';
import { escapeHtml } from './text.js?v=5f3ae5be70';

const PHONE_QUERY = '(max-width: 640px)';   // keep in step with the @media rule at the end of css/site.css
const LOADING_DELAY_MS = 150;                // a cached or fast file never flashes the loading skeleton
const RESIZE_DELAY_MS = 120;
const RANK_MODE_KEY = 'ah-rank-mode';
const RANK_MODES = ['rank', 'percentile'];
const PLAYER_KEY = 'Player';                 // always shown, frozen, not in the picker
const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];

// Which filter each input edits, and which input a removed chip hands focus back to.
const FILTER_OF_INPUT = {
  'f-q': 'search', 'f-pos': 'pos', 'f-team': 'team', 'f-min-seasons': 'minSeasons', 'f-mp': 'minMp', 'f-gp': 'minGp', 'f-age-min': 'ageMin', 'f-age-max': 'ageMax',
};
const INPUT_OF_CHIP = { search: 'f-q', pos: 'f-pos', team: 'f-team', minSeasons: 'f-min-seasons', minMp: 'f-mp', minGp: 'f-gp', age: 'f-age-min' };

const $ = (id) => document.getElementById(id);
const phone = window.matchMedia(PHONE_QUERY);

// ---------- state ----------
const state = {
  type: 'rs',
  season: null,            // the season of single mode
  multi: false,            // true: Multi mode, the table combines the ticked seasons
  ticked: [],              // Multi only: the seasons combined, newest first
  tab: null,
  filters: emptyFilters(),
  sort: null,              // { key, direction }
  picks: new Map(),        // tab name -> Set of picked column keys (created from the manifest defaults on first use)
  infoPicks: new Map(),    // tab name -> Set of shown Team, Pos, Age, GP, MP keys (all on at first use, like picks)
  filtersOpen: false,      // phone only
  rankMode: savedRankMode(),   // 'rank' | 'percentile': which number sits beside each value
  selected: new Map(),     // players ticked for compare: EntityId -> name; kept across tabs, seasons and RS/PO
  compare: false,          // true: the table shows only the selected players (see renderResults)
};
let manifest;
let glossary;
let columnsByKey;
let singleInfoColumns;     // the manifest's base columns after Player: the ones the visitor may hide
let bannerTitles;
let season = null;         // the data on screen: one season file, or in Multi the aggregated table; null while loading or after a load error
let status = 'loading';    // loading | ready | error (for the test hook)
let emptyKeys = new Set(); // columns with no data in the season(s) on screen
let shownRows = [];        // indexes passing the filters, source order
let rankPoolRows = [];     // indexes the ranks are computed over (see rankPool)
let view = null;           // what the table currently shows, null while a message panel is shown
let latestRequest = 0;
let seasonDraft = new Set();   // seasons ticked in the open checklist, not applied yet
let tooltip;
let hint;

// ---------- small lookups ----------
const typeWord = () => (state.type === 'po' ? 'playoffs' : 'regular season');
const activeSeasons = () => (state.multi ? state.ticked : [state.season]);
const seasonText = () => (state.multi ? `the selected seasons (${typeWord()})` : `${state.season} ${typeWord()}`);
// The source data's own minutes floor: the lowest of the active seasons' floors (a player shown in Multi has at least that many minutes in total).
const minMpFloor = () => Math.min(...activeSeasons().map((label) => manifest.min_mp[state.type][label]));

// The tab as the visitor sees it: in Multi, columns that cannot be averaged are left out (manifest `multi` rule "hidden").
function currentTab() {
  const tab = findTab(manifest, state.tab);
  if (!state.multi) return tab;
  return { ...tab, columns: tab.columns.filter(({ key }) => columnsByKey.get(key).multi !== 'hidden') };
}

// Team, Pos, Age, GP and MP; in Multi the Seasons column takes Team's place and the hidden ones (Team, Age) go.
function currentInfoColumns() {
  if (!state.multi) return singleInfoColumns;
  return [SEASONS_COLUMN, ...singleInfoColumns.filter((column) => column.multi !== 'hidden')];
}

// The visitor's last choice, kept like the theme. Storage can be blocked, then the default (rank) applies.
function savedRankMode() {
  try {
    const saved = localStorage.getItem(RANK_MODE_KEY);
    return RANK_MODES.includes(saved) ? saved : 'rank';
  } catch (error) {
    return 'rank';
  }
}

function rememberRankMode(mode) {
  try { localStorage.setItem(RANK_MODE_KEY, mode); } catch (error) { /* the choice just will not persist */ }
}

function picksOf(tab) {
  if (!state.picks.has(tab.name)) state.picks.set(tab.name, defaultPicks(findTab(manifest, tab.name)));   // the full tab, so Multi's hidden columns keep their default for single mode
  return state.picks.get(tab.name);
}

// Includes Seasons even in single mode, so a tab opened there still shows Seasons by default once Multi is switched on.
function allInfoPicks() {
  return new Set([...singleInfoColumns.map((column) => column.key), SEASONS_KEY]);
}

function infoPicksOf(tab) {
  if (!state.infoPicks.has(tab.name)) state.infoPicks.set(tab.name, allInfoPicks());
  return state.infoPicks.get(tab.name);
}

// ---------- loading the season(s) ----------
// Single mode: the season file itself. Multi: the ticked files, combined into one table (multi.js).
async function loadSelection() {
  if (!state.multi) return loadSeason(state.type, state.season);
  const labels = state.ticked;
  const files = await loadSeasons(state.type, labels);
  return aggregateSeasons(manifest, state.type, labels.map((label, index) => ({ label, file: files[index] })));
}

// Shows whatever `state` now asks for. A single season replaces the table with a loading skeleton; Multi keeps the old
// table, dimmed, so the page does not jump while up to 27 files arrive.
async function showSelection() {
  const request = ++latestRequest;
  const keepOldTable = state.multi && view !== null;
  season = null;
  syncSeasonControls();

  const loadingTimer = setTimeout(() => {
    status = 'loading';
    if (keepOldTable) showBusy(busyHtml(state.ticked.length), false); else showPanel(loadingHtml());
  }, LOADING_DELAY_MS);
  try {
    const loaded = await loadSelection();
    if (request !== latestRequest) return;
    season = loaded;
    status = 'ready';
    applySeason();
  } catch (error) {
    if (request !== latestRequest) return;
    status = 'error';
    if (keepOldTable) showBusy(busyErrorHtml(), true); else showPanel(errorHtml(state.multi ? 'the selected seasons' : `${state.type}/${state.season}.json`));
  } finally {
    clearTimeout(loadingTimer);
  }
}

// Everything that depends on which season data is on screen.
function applySeason() {
  hideBusy();
  emptyKeys = emptyColumnKeys(manifest, state.type, activeSeasons());
  fillFilterOptions();
  dropFiltersThatNoLongerApply();
  resetTableScroll();
  updateTabs($('tabs'), $('tab-select'), manifest.tabs, state.tab, emptyKeys);
  renderPicker();
  renderResults();
}

function fillFilterOptions() {
  const option = (value) => `<option>${escapeHtml(value)}</option>`;
  const positions = [...new Set(season.cols.Pos.filter((pos) => pos !== null))].sort((a, b) => {
    const rankA = POSITION_ORDER.indexOf(a) < 0 ? POSITION_ORDER.length : POSITION_ORDER.indexOf(a);
    const rankB = POSITION_ORDER.indexOf(b) < 0 ? POSITION_ORDER.length : POSITION_ORDER.indexOf(b);
    return rankA - rankB || a.localeCompare(b);
  });
  $('f-pos').innerHTML = `<option value="">All</option>${positions.map(option).join('')}`;
  if (state.multi) {
    $('f-min-seasons').innerHTML = state.ticked.map((unused, index) => `<option value="${index + 1}">${index + 1}+</option>`).join('');
  } else {
    const teams = [...new Set(season.cols.Team)].sort();
    $('f-team').innerHTML = `<option value="">All</option>${teams.map(option).join('')}`;
  }
  $('f-mp').min = minMpFloor();
}

// A filter value chosen for another season may not exist here (a team that did not exist yet) or may now sit at or
// below this season's minutes floor.
function dropFiltersThatNoLongerApply() {
  const filters = state.filters;
  if (filters.team && !season.cols.Team.includes(filters.team)) filters.team = '';
  if (filters.pos && !season.cols.Pos.includes(filters.pos)) filters.pos = '';
  if (filters.minMp !== null && filters.minMp <= minMpFloor()) filters.minMp = null;
  if (state.multi) filters.minSeasons = Math.min(filters.minSeasons, state.ticked.length);   // the dropdown only goes up to the number of ticked seasons
}

function resetTableScroll() {
  $('table-wrap').scrollLeft = 0;
  $('table-wrap').scrollTop = 0;
}

// ---------- rendering ----------
// Everything that changes when a filter, the season or the picked columns change.
function renderResults() {
  if (!season) return;   // a control was used before the first season file arrived
  const passingFilters = filterRows(season, state.filters);
  const selectedRows = rowsOfSelected(season, state.selected);
  shownRows = state.compare ? passingFilters.filter((row) => selectedRows.has(row)) : passingFilters;
  rankPoolRows = rankPool();
  renderFilterState();
  renderCompareControls();
  renderSelectionNote(selectedRows.size - shownRows.length);
  renderLegend();
  renderNotice();
  renderMain();
  renderCredits();
}

// While a name is searched or the compare view is on, ranks are computed over the default view: no filters, so the
// season file's own minutes floor and every position, team and age. A searched or compared player keeps their real
// league rank instead of "1 of 1", whatever other filters are set. Otherwise the pool is the shown rows.
function rankPool() {
  return state.compare || state.filters.search.trim() ? filterRows(season, emptyFilters()) : shownRows;
}

// The controls that follow the mode and the season choice: type buttons, Multi switch, season select or checklist button,
// the filters that exist in one mode only, and the Multi note line.
function syncSeasonControls() {
  const available = manifest.seasons[state.type];
  $('type-rs').setAttribute('aria-pressed', String(state.type === 'rs'));
  $('type-po').setAttribute('aria-pressed', String(state.type === 'po'));
  $('multi-switch').setAttribute('aria-checked', String(state.multi));
  $('season').innerHTML = available.map((label) => `<option>${escapeHtml(label)}</option>`).join('');
  $('season').value = state.season;
  $('season').hidden = state.multi;
  $('season-multi').hidden = !state.multi;
  if (state.multi) {
    $('season-btn').textContent = seasonButtonLabel(available, state.ticked);
    const listTip = seasonButtonTip(available, state.ticked);
    if (listTip) $('season-btn').dataset.tip = listTip; else delete $('season-btn').dataset.tip;
  }
  for (const field of document.querySelectorAll('[data-single-only]')) field.hidden = state.multi;
  for (const field of document.querySelectorAll('[data-multi-only]')) field.hidden = !state.multi;
  $('mp-label').textContent = state.multi ? 'Min MP (total)' : 'Min MP';
  $('multi-note').innerHTML = MULTI_NOTE_HTML;
  $('multi-note').hidden = !state.multi;
}

// Input values are only rewritten when `force` is set or the input is not being typed in.
function setInputValue(id, value, force) {
  const input = $(id);
  if ((force || document.activeElement !== input) && String(input.value) !== String(value)) input.value = value;
}

function syncFilterInputs(force) {
  const filters = state.filters;
  setInputValue('f-q', filters.search, force);
  setInputValue('f-pos', filters.pos, force);
  setInputValue('f-team', filters.team, force);
  setInputValue('f-min-seasons', filters.minSeasons, force);
  setInputValue('f-mp', filters.minMp ?? minMpFloor(), force);
  setInputValue('f-gp', filters.minGp ?? '', force);
  setInputValue('f-age-min', filters.ageMin ?? '', force);
  setInputValue('f-age-max', filters.ageMax ?? '', force);
}

function renderFilterState() {
  const names = activeFilterNames(state.filters);
  syncFilterInputs(false);
  for (const field of document.querySelectorAll('[data-filter]')) {
    field.classList.toggle('is-set', names.includes(field.dataset.filter));
  }
  const chip = (name, label, removeText) =>
    `<button type="button" class="chip" data-clear="${name}">${escapeHtml(label)} &times;<span class="sr-only"> (${removeText})</span></button>`;
  const compareChip = state.compare ? [chip('compare', `Comparing ${state.selected.size} players`, 'leave compare view')] : [];
  $('chips').innerHTML = [...compareChip, ...names.map((name) => chip(name, chipLabel(name, state.filters), 'remove filter'))].join('');

  const filtersButton = $('filters-btn');
  filtersButton.textContent = `Filters${names.length ? ` (${names.length})` : ''}`;
  filtersButton.classList.toggle('is-set', names.length > 0);

  const active = [];
  if (state.compare) active.push('compare view');
  if (names.length) active.push(`${names.length} filter${names.length > 1 ? 's' : ''} active`);
  const multiText = state.multi ? ` &middot; ${state.ticked.length} season${state.ticked.length > 1 ? 's' : ''} (Multi)` : '';
  $('count').innerHTML = `<b>${shownRows.length}</b> of ${season.n} players${multiText}` +
    (active.length ? ` &middot; ${active.join(' &middot; ')} <button type="button" class="link" data-reset>Reset</button>` : '');
}

// The Compare button: needs two ticked players to start, and always works as "Show all" while the compare view is on.
function renderCompareControls() {
  const button = $('compare-btn');
  button.textContent = state.compare ? 'Show all' : `Compare (${state.selected.size})`;
  button.disabled = !state.compare && state.selected.size < 2;
  button.classList.toggle('is-on', state.compare);
  button.title = state.compare ? 'Back to the full table (your ticks are kept)' : 'Tick at least 2 players to compare';
}

// Says how many selected players the filters hide (compare view only) and who has no row in this season.
function renderSelectionNote(hiddenByFilters) {
  const sentences = [];
  if (state.compare && hiddenByFilters > 0) {
    sentences.push(`${hiddenByFilters} selected player${hiddenByFilters > 1 ? 's are' : ' is'} hidden by the current filters.`);
  }
  const absent = namesNotInSeason(season, state.selected);
  if (absent.length) sentences.push(`Not in ${seasonText()}: ${absent.join(', ')}.`);
  $('selection-note').textContent = sentences.join(' ');
  $('selection-note').hidden = sentences.length === 0;
}

// The legend names the five color steps for the current mode and says which players the numbers are over (see rankPool).
function renderLegend() {
  const everyone = state.multi ? 'all players in the selected seasons' : 'all players this season';
  const scope = state.compare ? `${everyone} (compare view)`
    : state.filters.search.trim() ? `${everyone} (name search)` : 'rows shown';
  const percentile = state.rankMode === 'percentile';
  const labels = percentile ? ['90\u2013100', '70\u201389', '30\u201369', '10\u201329', '0\u20139'] : ['top', 'upper', 'middle', 'lower', 'bottom'];
  $('legend').innerHTML = `<span>${percentile ? 'Percentile' : 'Rank'} among ${scope}:</span>` +
    labels.map((label, index) => `<span class="rank r${index + 1}">${label}</span>`).join('') +
    '<span class="muted">&nbsp;&middot; no color = not ranked</span>' +
    (state.multi ? '<span class="fewer-key">italic = fewer seasons</span>' : '');
}

// Names the columns of this tab that have no data for the season and are therefore left out (partly empty tabs only;
// a fully empty tab gets its own panel).
function renderNotice() {
  const tab = currentTab();
  const emptyNames = tab.columns.filter((column) => emptyKeys.has(column.key)).map((column) => columnsByKey.get(column.key).name);
  const partlyEmpty = emptyNames.length > 0 && emptyNames.length < tab.columns.length;
  $('notice').innerHTML = partlyEmpty
    ? `<b>${emptyNames.length} of ${tab.columns.length} columns</b> in this tab have no data for ${escapeHtml(seasonText())} and are not shown: ${escapeHtml(emptyNames.join(', '))}.`
    : '';
  $('notice').hidden = !partlyEmpty;
}

function showPanel(html) {
  hideBusy();
  view = null;
  $('table-wrap').hidden = true;
  $('state-panel').innerHTML = html;
  $('state-panel').hidden = false;
}

// Multi loading or load error: the table on screen is dimmed and a message sits on top of it.
function showBusy(html, isError) {
  $('panel').classList.add('is-busy');
  $('table-wrap').classList.add('is-dim');
  $('loading-bar').hidden = isError;
  $('overlay').classList.toggle('is-error', isError);
  $('overlay').innerHTML = html;
  $('overlay').hidden = false;
}

function hideBusy() {
  $('panel').classList.remove('is-busy');
  $('table-wrap').classList.remove('is-dim');
  $('loading-bar').hidden = true;
  $('overlay').hidden = true;
}

// A search that finds nobody because of Min seasons gets its own message and a one-click fix.
function nothingToShowHtml() {
  const withoutMinSeasons = { ...state.filters, minSeasons: 1 };
  const blamesMinSeasons = state.filters.minSeasons > 1 && filterRows(season, withoutMinSeasons).length > 0;
  return blamesMinSeasons ? noMinSeasonsHtml(state.filters.minSeasons, state.ticked.length) : noResultsHtml();
}

function renderMain() {
  const tab = currentTab();
  tooltip.hide();
  hint.hide();
  if (tabIsEmpty(tab, emptyKeys)) {
    const otherSeason = state.multi ? undefined : newestSeasonWithData(manifest, tab, state.type, state.season);
    showPanel(emptyTabHtml(tab.name, seasonText(), otherSeason));
  } else if (shownRows.length === 0) {
    showPanel(nothingToShowHtml());
  } else {
    renderTable(tab);
  }
}

function renderTable(tab) {
  const { shownKeys } = splitPickedColumns(tab, picksOf(tab), emptyKeys);
  const shownInfoKeys = currentInfoColumns().map((column) => column.key).filter((key) => infoPicksOf(tab).has(key));
  const columns = [PLAYER_KEY, ...shownInfoKeys, ...shownKeys].map((key) => columnsByKey.get(key));
  ensureSortColumn(columns, shownKeys);

  const rows = sortRows(shownRows, season, columnsByKey.get(state.sort.key), state.sort.direction);
  const rankTables = buildRankTables(columns, season, rankPoolRows);
  const rankDigits = new Map([...rankTables].map(([key, rankTable]) => [key, widestNumberDigits(rankTable, state.rankMode)]));
  view = { columns, season, rows, rankTables, rankMode: state.rankMode, rankDigits, selected: state.selected, sort: state.sort, bannerTitles, glossary };

  const { hasBanner, html } = tableHtml(view);
  $('grid').className = hasBanner ? 'has-group' : '';
  $('grid').innerHTML = html;
  $('state-panel').hidden = true;
  $('table-wrap').hidden = false;
  fitCurrentTable();
}

// Keeps the sort if its column is still on screen, otherwise sorts by the tab's first shown stat column (MP when the
// visitor hid them all).
function ensureSortColumn(columns, shownStatKeys) {
  if (state.sort && columns.some((column) => column.key === state.sort.key)) return;
  const first = columnsByKey.get(shownStatKeys[0] ?? 'MP');
  state.sort = { key: first.key, direction: naturalSortDirection(first) };
}

function fitCurrentTable() {
  if (view) fitColumns($('grid'), $('table-wrap'), view, phone.matches);
}

function renderCredits() {
  const namesBySource = new Map();
  for (const column of view ? view.columns : []) {
    if (!column.source) continue;
    if (!namesBySource.has(column.source)) namesBySource.set(column.source, []);
    namesBySource.get(column.source).push(column.name);
  }
  const parts = [...namesBySource].map(([source, names]) =>
    `<b>${escapeHtml(source)}</b> (${escapeHtml(sourceTag(source))}): ${escapeHtml(names.join(', '))}`);
  $('credits').innerHTML = parts.length ? `<b>Credits.</b> ${parts.join(' &middot; ')}` : '';
  $('credits').hidden = parts.length === 0;
}

function renderPicker() {
  const tab = currentTab();
  $('picker-body').innerHTML = pickerHtml(tab, picksOf(tab), currentInfoColumns(), infoPicksOf(tab), emptyKeys, columnsByKey, bannerTitles) +
    (state.multi ? '<p class="pk-note">Columns that cannot be averaged are not listed in Multi.</p>' : '');
  updatePickerLabel();
}

function updatePickerLabel() {
  const tab = currentTab();
  $('picker-btn').textContent = pickerLabel(tab, picksOf(tab), emptyKeys);
}

function closePicker() {
  $('picker').hidden = true;
  $('picker-btn').setAttribute('aria-expanded', 'false');
}

// ---------- actions ----------
function setSeason(label) {
  state.season = label;
  return showSelection();
}

// Regular season <-> playoffs. Single mode falls back to the newest season if this one has no file; Multi keeps the ticked
// seasons that exist and says so when it drops one (2026-27 has no playoffs yet).
function setType(type) {
  const available = manifest.seasons[type];
  hideFlash();
  state.type = type;
  if (!state.multi) {
    if (!available.includes(state.season)) state.season = available[0];
    return showSelection();
  }
  const dropped = state.ticked.filter((label) => !available.includes(label));
  state.ticked = state.ticked.filter((label) => available.includes(label));
  if (state.ticked.length === 0) state.ticked = [available[0]];
  if (dropped.length) showFlash(`${dropped.join(', ')} ${dropped.length > 1 ? 'have' : 'has'} no ${typeWord()}, dropped.`);
  return showSelection();
}

// The Multi switch. Turning it on starts from the season the visitor was viewing; turning it off returns to the newest
// ticked season. Team and Age filters have no meaning across seasons, so entering Multi clears them.
// Leaving Multi resets Min MP to the season's floor and clears Min GP: in Multi they are totals, which mean something else for one season.
function setMulti(on) {
  if (on === state.multi) return;
  hideFlash();
  closeSeasonList(false);
  const filters = state.filters;
  if (on) {
    const hadTeamOrAge = filters.team !== '' || filters.ageMin !== null || filters.ageMax !== null;
    state.multi = true;
    state.ticked = [state.season];
    filters.team = '';
    filters.ageMin = null;
    filters.ageMax = null;
    if (hadTeamOrAge) showFlash('Team and Age filters were cleared for Multi.');
  } else {
    state.multi = false;
    state.season = state.ticked[0];
    filters.minSeasons = 1;
    filters.minMp = null;   // Min MP and Min GP meant totals across seasons; as per-season limits they would hide almost everyone
    filters.minGp = null;
    if (state.ticked.length > 1) showFlash(`Back to a single season: ${state.season}, the newest of your ticked seasons.`);
  }
  return showSelection();
}

// ---------- the season checklist (Multi) ----------
// The master list of seasons is the regular-season one; playoffs have the same seasons minus those not played yet.
function renderSeasonList() {
  $('sp-list').innerHTML = checklistHtml(manifest.seasons.rs, manifest.seasons[state.type], seasonDraft);
  $('sp-count').textContent = `${seasonDraft.size} selected`;
}

function openSeasonList() {
  seasonDraft = new Set(state.ticked);
  renderSeasonList();
  $('season-pop').hidden = false;
  $('season-btn').setAttribute('aria-expanded', 'true');
  $('backdrop').hidden = !phone.matches;
  $('sp-list').querySelector('input:not(:disabled)')?.focus();
}

function closeSeasonList(returnFocus) {
  $('season-pop').hidden = true;
  $('backdrop').hidden = true;
  $('season-btn').setAttribute('aria-expanded', 'false');
  if (returnFocus) $('season-btn').focus();
}

function applySeasonList() {
  const picked = manifest.seasons.rs.filter((label) => seasonDraft.has(label));   // newest first
  closeSeasonList(true);
  if (picked.join() === state.ticked.join()) return;
  setTicked(picked);
}

function setTicked(labels) {
  state.ticked = labels;
  return showSelection();
}

function showFlash(text) {
  $('flash').innerHTML = `<span>${escapeHtml(text)}</span><button type="button" data-dismiss-flash aria-label="Dismiss">&times;</button>`;
  $('flash').hidden = false;
}

function hideFlash() {
  $('flash').hidden = true;
}

function setTab(name) {
  if (!findTab(manifest, name)) return;
  state.tab = name;
  resetTableScroll();
  updateTabs($('tabs'), $('tab-select'), manifest.tabs, state.tab, emptyKeys);
  $('panel').setAttribute('aria-labelledby', `tab-${manifest.tabs.findIndex((tab) => tab.name === name)}`);
  renderPicker();
  renderResults();
}

function numberOrNull(raw) {
  if (raw === '' || raw === null) return null;
  const number = Number(raw);
  return Number.isNaN(number) ? null : number;
}

function setFilter(name, raw) {
  if (!season) return;
  const filters = state.filters;
  if (name === 'pos' || name === 'team' || name === 'search') {
    filters[name] = raw ?? '';
  } else if (name === 'minSeasons') {
    filters.minSeasons = Number(raw);
  } else {
    let number = numberOrNull(raw);
    // The minutes filter cannot go below the data's own floor; "no minimum" is the same as the floor.
    if (name === 'minMp' && number !== null && number <= minMpFloor()) number = null;
    if (name === 'minGp' && number !== null && number <= 0) number = null;
    filters[name] = number;
  }
  renderResults();
}

function clearFilter(chipName) {
  if (chipName === 'compare') {
    showAll();
    $('table-wrap').focus({ preventScroll: true });   // the Compare button is disabled again, so it cannot take focus
    return;
  }
  const fresh = emptyFilters();
  for (const name of chipName === 'age' ? ['ageMin', 'ageMax'] : [chipName]) state.filters[name] = fresh[name];
  renderResults();
  syncFilterInputs(true);
  // After removing a chip, focus goes to its control, or to the Filters button while the phone filters are collapsed.
  const control = $(INPUT_OF_CHIP[chipName]);
  (control.offsetParent !== null ? control : $('filters-btn')).focus({ preventScroll: true });
}

// Reset clears the filters, the ticked players and the compare view.
function resetFilters() {
  state.filters = emptyFilters();
  state.selected.clear();
  state.compare = false;
  renderResults();
  syncFilterInputs(true);
}

// "Show all" (button or chip): leaves the compare view and unticks every player, so the Compare button starts over at 0.
function showAll() {
  state.selected.clear();
  setCompare(false);
}

function setCompare(on) {
  if (on && state.selected.size < 2) return;   // the button is disabled in this case
  state.compare = on;
  resetTableScroll();
  renderResults();
}

// Ticking a player. In the full table only the controls change (the table stays as it is, so scroll and focus are kept);
// in the compare view the row leaves the table, and with fewer than two players left the compare view ends.
function toggleSelected(entityId, name, on) {
  const inCompareView = state.compare;
  const box = $('grid').querySelector(`.pick-input[data-id="${entityId}"]`);
  if (box) box.checked = on;   // already so when the click came from the box itself
  if (on) state.selected.set(entityId, name); else state.selected.delete(entityId);
  if (state.selected.size < 2) state.compare = false;
  if (inCompareView) {
    renderResults();
    return;
  }
  renderCompareControls();
  renderSelectionNote(0);
}

function sortBy(key, direction) {
  if (!season) return;   // the table on screen is dimmed while Multi loads
  const column = columnsByKey.get(key);
  const sameColumn = state.sort && state.sort.key === key;
  const flipped = state.sort && state.sort.direction === 'asc' ? 'desc' : 'asc';
  state.sort = { key, direction: direction ?? (sameColumn ? flipped : naturalSortDirection(column)) };
  renderMain();
  $('grid').querySelector(`[data-sort="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });   // the header was re-rendered
}

function setRankMode(mode) {
  state.rankMode = mode;
  rememberRankMode(mode);
  syncRankModeControls();
  renderLegend();
  if (season) renderMain();
}

// The switch buttons and the body class that styles the numbers as chips.
function syncRankModeControls() {
  for (const button of document.querySelectorAll('[data-rank-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.rankMode === state.rankMode));
  }
  document.body.classList.toggle('percentile-mode', state.rankMode === 'percentile');
}

function pickColumns(action) {
  const tab = findTab(manifest, state.tab);   // the full tab: a Default or All pick also covers columns Multi hides
  const wanted = (column) => action === 'all' || (action === 'default' && column.default_visible);
  state.picks.set(tab.name, new Set(tab.columns.filter(wanted).map((column) => column.key)));
  // None hides the player-info columns too (only Player stays); Default and All bring them back.
  state.infoPicks.set(tab.name, action === 'none' ? new Set() : allInfoPicks());
  renderPicker();
  renderResults();
}

// Phone only (CSS, 640px and below): collapsed hides the filter fields so the table gets the screen.
function setFiltersOpen(open) {
  state.filtersOpen = open;
  document.body.classList.toggle('filters-closed', !open);
  $('filters-btn').setAttribute('aria-expanded', String(open));
}

// ---------- events ----------
function wireTabs() {
  $('tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (button) setTab(button.dataset.tab);
  });
  $('tabs').addEventListener('keydown', (event) => {   // arrow keys move between tabs
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = manifest.tabs.findIndex((tab) => tab.name === state.tab);
    const next = (index + step + manifest.tabs.length) % manifest.tabs.length;
    setTab(manifest.tabs[next].name);
    $('tabs').children[next].focus();
  });
  $('tab-select').addEventListener('change', (event) => setTab(event.target.value));
}

function wireToolbar() {
  for (const button of document.querySelectorAll('[data-type]')) {
    button.addEventListener('click', () => { if (button.dataset.type !== state.type) setType(button.dataset.type); });
  }
  for (const button of document.querySelectorAll('[data-rank-mode]')) {
    button.addEventListener('click', () => { if (button.dataset.rankMode !== state.rankMode) setRankMode(button.dataset.rankMode); });
  }
  $('season').addEventListener('change', (event) => setSeason(event.target.value));
  $('multi-switch').addEventListener('click', () => setMulti(!state.multi));
  $('filters-btn').addEventListener('click', () => setFiltersOpen(!state.filtersOpen));
  $('compare-btn').addEventListener('click', () => { if (state.compare) showAll(); else setCompare(true); });

  $('toolbar').addEventListener('input', (event) => {
    const name = FILTER_OF_INPUT[event.target.id];
    if (!name) return;
    // While typing, wait until the minutes value is valid; the change event below snaps it back otherwise.
    if (name === 'minMp' && event.target.value !== '' && Number(event.target.value) < minMpFloor()) return;
    setFilter(name, event.target.value);
  });
  $('toolbar').addEventListener('change', (event) => {
    const name = FILTER_OF_INPUT[event.target.id];
    if (!name) return;
    setFilter(name, event.target.value);
    syncFilterInputs(true);
  });

  $('chips').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-clear]');
    if (chip) clearFilter(chip.dataset.clear);
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-reset]')) resetFilters();
  });
  $('flash').addEventListener('click', (event) => {
    if (event.target.closest('[data-dismiss-flash]')) hideFlash();
  });
}

function wireSeasonList() {
  $('season-btn').addEventListener('click', () => { if ($('season-pop').hidden) openSeasonList(); else closeSeasonList(false); });
  $('season-apply').addEventListener('click', applySeasonList);
  $('season-cancel').addEventListener('click', () => closeSeasonList(true));
  $('backdrop').addEventListener('click', () => closeSeasonList(true));
  phone.addEventListener('change', () => closeSeasonList(false));   // the popover and the sheet are different layouts

  $('sp-list').addEventListener('change', (event) => {
    const label = event.target.dataset.season;
    if (event.target.checked) seasonDraft.add(label); else seasonDraft.delete(label);
    renderSeasonList();   // redraws the rows, so the one remaining ticked box can be disabled
    $('sp-list').querySelector(`input[data-season="${label}"]:not(:disabled)`)?.focus();
  });
  $('sp-list').addEventListener('keydown', (event) => {   // arrow keys move between the boxes
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const boxes = [...$('sp-list').querySelectorAll('input:not(:disabled)')];
    const next = boxes[boxes.indexOf(event.target) + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next) { event.preventDefault(); next.focus(); }
  });
  document.addEventListener('click', (event) => {   // a click elsewhere closes the list without applying
    if (!$('season-pop').hidden && !event.target.closest('#season-multi')) closeSeasonList(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('season-pop').hidden) closeSeasonList(true);
  });
}

function wirePicker() {
  $('picker-btn').addEventListener('click', () => {
    const opening = $('picker').hidden;
    $('picker').hidden = !opening;
    $('picker-btn').setAttribute('aria-expanded', String(opening));
  });
  $('picker').addEventListener('click', (event) => {
    const action = event.target.closest('[data-pick-action]');
    if (action) pickColumns(action.dataset.pickAction);
  });
  $('picker').addEventListener('change', (event) => {
    const infoKey = event.target.dataset.infoPick;
    const key = infoKey ?? event.target.dataset.pick;
    const picks = infoKey ? infoPicksOf(currentTab()) : picksOf(currentTab());
    if (event.target.checked) picks.add(key); else picks.delete(key);
    updatePickerLabel();
    renderResults();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#picker, #picker-btn')) closePicker();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('picker').hidden) { closePicker(); $('picker-btn').focus(); }
  });
}

function wireTable() {
  $('grid').addEventListener('change', (event) => {
    const box = event.target.closest('.pick-input');
    if (!box) return;
    const entityId = Number(box.dataset.id);
    const inCompareView = state.compare;
    toggleSelected(entityId, season.cols.Player[season.id.indexOf(entityId)], box.checked);
    if (inCompareView) $('table-wrap').focus({ preventScroll: true });   // the ticked row was re-rendered away
  });
  $('grid').addEventListener('click', (event) => {
    const header = event.target.closest('[data-sort]');
    if (header) sortBy(header.dataset.sort);
  });
  $('panel').addEventListener('click', (event) => {   // the message panels and the Multi loading overlay
    const jump = event.target.closest('[data-switch-season]');
    if (jump) setSeason(jump.dataset.switchSeason);
    if (event.target.closest('[data-retry]')) showSelection();
    if (event.target.closest('[data-fix-min-seasons]')) setFilter('minSeasons', 1);   // Min seasons was the only reason nobody matched
  });
  $('table-wrap').addEventListener('scroll', () => tooltip.hide());

  let resizeTimer;
  window.addEventListener('resize', () => {
    tooltip.hide();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitCurrentTable, RESIZE_DELAY_MS);
  });
  document.fonts.addEventListener('loadingdone', fitCurrentTable);   // measure again once the web font has arrived
}

// ---------- test hook for QA (documented in README.md) ----------
// Works for any column of the season file, shown or not; the number is over the rank pool. Null when the row is hidden by
// the filters or the column has no number for it.
function numberOver(entityId, key, lookup) {
  const row = season.id.indexOf(entityId);
  const column = columnsByKey.get(key);
  const value = season.cols[key][row];
  if (!shownRows.includes(row) || column.rank === 'none' || column.format === 'text' || value === null) return null;
  return lookup(buildRankTable(season.cols[key], rankPoolRows, column.rank), value);
}

function installTestHook() {
  window.AH_TEST = {
    setTab,
    setFilter: (name, value) => { setFilter(name, value); syncFilterInputs(true); },
    resetFilters,
    sortBy,
    setSeason,
    setType,
    setMulti,
    setTicked: (labels) => setTicked(manifest.seasons.rs.filter((label) => labels.includes(label))),   // any order; stored newest first
    openSeasonList,
    setTheme: (theme) => { if (document.documentElement.dataset.theme !== theme) $('theme').click(); },
    setFiltersOpen,
    pickColumns,
    visibleRows: () => (view ? view.rows.map((row) => season.id[row]) : []),
    visibleColumns: () => (view ? view.columns.map((column) => column.key) : []),
    setRankMode,
    select: (entityId, on = true) => toggleSelected(entityId, season.cols.Player[season.id.indexOf(entityId)], on),   // a player of the season on screen
    setCompare,
    showAll,
    data: () => (season ? { id: season.id, cols: season.cols, contributed: season.contributed ? Object.fromEntries([...season.contributed].map(([key, counts]) => [key, Array.from(counts)])) : null } : null),   // every cell of the data on screen (all columns, all players)
    rankOf: (entityId, key) => numberOver(entityId, key, lookupRank),
    percentileOf: (entityId, key) => numberOver(entityId, key, lookupPercentile),
    state: () => ({
      type: state.type, season: state.season, multi: state.multi, ticked: [...state.ticked], tab: state.tab, status, sort: state.sort, filtersOpen: state.filtersOpen, rankMode: state.rankMode, compare: state.compare, selected: [...state.selected.keys()], compareEnabled: !$('compare-btn').disabled,
      filters: { ...state.filters }, shown: shownRows.length, total: season ? season.n : 0,
    }),
  };
}

// ---------- start ----------
async function start() {
  try {
    [manifest, glossary] = await Promise.all([loadManifest(), loadGlossary()]);
  } catch (error) {
    showPanel(errorHtml('the site data'));
    $('state-panel').addEventListener('click', () => location.reload());   // without the manifest nothing else works
    return;
  }
  columnsByKey = indexColumnsByKey(manifest);
  singleInfoColumns = manifest.base_columns.filter((key) => key !== PLAYER_KEY).map((key) => columnsByKey.get(key));
  bannerTitles = indexBannerTitles(glossary);
  // The Seasons column exists only in Multi, so neither data file lists it. Registering it here lets the table, the
  // column fitter and the header tooltip treat it like any other column.
  columnsByKey.set(SEASONS_KEY, SEASONS_COLUMN);
  glossary.entries[SEASONS_KEY] = SEASONS_ENTRY;

  const requestedTab = new URLSearchParams(location.search).get('tab');   // the glossary links back with ?tab=
  state.tab = findTab(manifest, requestedTab) ? requestedTab : manifest.tabs[0].name;
  buildTabs($('tabs'), $('tab-select'), manifest.tabs);
  $('panel').setAttribute('aria-labelledby', `tab-${manifest.tabs.findIndex((tab) => tab.name === state.tab)}`);

  tooltip = setUpTooltip($('tip'), $('grid'), (key) => ({
    column: columnsByKey.get(key),
    tooltip: glossary.entries[key].tooltip,
    link: glossary.entries[key].link,
  }));
  wireTabs();
  hint = setUpHint($('hint'));
  wireToolbar();
  wireSeasonList();
  wirePicker();
  wireTable();
  installTestHook();
  setFiltersOpen(false);
  syncRankModeControls();

  state.season = manifest.seasons.rs[0];
  await showSelection();
  document.body.dataset.ready = 'true';
}

start();
