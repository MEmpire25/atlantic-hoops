// Stats page. The flow, top to bottom:
//   load data (data.js) -> apply filters (filters.js) -> compute ranks (ranks.js) -> sort (sorting.js) -> render (table.js)
// This file holds the page state and connects the controls to that flow.
import { loadManifest, loadGlossary, loadSeason } from './data.js';
import { emptyFilters, activeFilterNames, chipLabel, filterRows } from './filters.js';
import { buildRankTable, buildRankTables, lookupRank } from './ranks.js';
import { naturalSortDirection, sortRows } from './sorting.js';
import {
  indexColumnsByKey, indexBannerTitles, findTab, defaultPicks, emptyColumnKeys, tabIsEmpty,
  newestSeasonWithData, splitPickedColumns, sourceTag,
} from './columns.js';
import { tableHtml } from './table.js';
import { fitColumns } from './measure.js';
import { buildTabs, updateTabs } from './tabs.js';
import { pickerHtml, pickerLabel } from './picker.js';
import { loadingHtml, errorHtml, noResultsHtml, emptyTabHtml } from './panels.js';
import { setUpTooltip } from './tooltip.js';
import { escapeHtml } from './text.js';

const PHONE_QUERY = '(max-width: 640px)';   // keep in step with the @media rule at the end of css/site.css
const LOADING_DELAY_MS = 150;                // a cached or fast file never flashes the loading skeleton
const RESIZE_DELAY_MS = 120;
const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];

// Which filter each input edits, and which input a removed chip hands focus back to.
const FILTER_OF_INPUT = {
  'f-q': 'search', 'f-pos': 'pos', 'f-team': 'team', 'f-mp': 'minMp', 'f-gp': 'minGp', 'f-age-min': 'ageMin', 'f-age-max': 'ageMax',
};
const INPUT_OF_CHIP = { search: 'f-q', pos: 'f-pos', team: 'f-team', minMp: 'f-mp', minGp: 'f-gp', age: 'f-age-min' };

const $ = (id) => document.getElementById(id);
const phone = window.matchMedia(PHONE_QUERY);

// ---------- state ----------
const state = {
  type: 'rs',
  season: null,
  tab: null,
  filters: emptyFilters(),
  sort: null,              // { key, direction }
  picks: new Map(),        // tab name -> Set of picked column keys (created from the manifest defaults on first use)
  filtersOpen: false,      // phone only
};
let manifest;
let glossary;
let columnsByKey;
let bannerTitles;
let season = null;         // the season file on screen; null while loading or after a load error
let status = 'loading';    // loading | ready | error (for the test hook)
let emptyKeys = new Set(); // columns with no data in this season
let shownRows = [];        // indexes passing the filters, source order
let view = null;           // what the table currently shows, null while a message panel is shown
let latestRequest = 0;
let retryRequest = null;
let tooltip;

// ---------- small lookups ----------
const currentTab = () => findTab(manifest, state.tab);
const seasonText = () => `${state.season} ${state.type === 'po' ? 'playoffs' : 'regular season'}`;
const minMpFloor = () => manifest.min_mp[state.type][state.season];   // the source data's own floor for this season

function picksOf(tab) {
  if (!state.picks.has(tab.name)) state.picks.set(tab.name, defaultPicks(tab));
  return state.picks.get(tab.name);
}

// ---------- loading a season ----------
async function showSeason(type, seasonLabel) {
  const request = ++latestRequest;
  state.type = type;
  state.season = seasonLabel;
  season = null;
  retryRequest = { type, seasonLabel };
  syncSeasonControls();

  const loadingTimer = setTimeout(() => { status = 'loading'; showPanel(loadingHtml()); }, LOADING_DELAY_MS);
  try {
    const loaded = await loadSeason(type, seasonLabel);
    if (request !== latestRequest) return;
    season = loaded;
    status = 'ready';
    applySeason();
  } catch (error) {
    if (request !== latestRequest) return;
    status = 'error';
    showPanel(errorHtml(`${type}/${seasonLabel}.json`));
  } finally {
    clearTimeout(loadingTimer);
  }
}

// Everything that depends on which season file is on screen.
function applySeason() {
  emptyKeys = emptyColumnKeys(manifest, state.type, state.season);
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
  const teams = [...new Set(season.cols.Team)].sort();
  $('f-pos').innerHTML = `<option value="">All</option>${positions.map(option).join('')}`;
  $('f-team').innerHTML = `<option value="">All</option>${teams.map(option).join('')}`;
  $('mp-hint').textContent = `(from ${minMpFloor()})`;
  $('f-mp').min = minMpFloor();
}

// A filter value chosen for another season may not exist here (a team that did not exist yet) or may now sit at or
// below this season's minutes floor.
function dropFiltersThatNoLongerApply() {
  const filters = state.filters;
  if (filters.team && !season.cols.Team.includes(filters.team)) filters.team = '';
  if (filters.pos && !season.cols.Pos.includes(filters.pos)) filters.pos = '';
  if (filters.minMp !== null && filters.minMp <= minMpFloor()) filters.minMp = null;
}

function resetTableScroll() {
  $('table-wrap').scrollLeft = 0;
  $('table-wrap').scrollTop = 0;
}

// ---------- rendering ----------
// Everything that changes when a filter, the season or the picked columns change.
function renderResults() {
  if (!season) return;   // a control was used before the first season file arrived
  shownRows = filterRows(season, state.filters);
  renderFilterState();
  renderNotice();
  renderMain();
  renderCredits();
}

function syncSeasonControls() {
  $('type-rs').setAttribute('aria-pressed', String(state.type === 'rs'));
  $('type-po').setAttribute('aria-pressed', String(state.type === 'po'));
  $('season').innerHTML = manifest.seasons[state.type].map((label) => `<option>${escapeHtml(label)}</option>`).join('');
  $('season').value = state.season;
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
  $('chips').innerHTML = names.map((name) =>
    `<button type="button" class="chip" data-clear="${name}">${escapeHtml(chipLabel(name, state.filters))} &times;<span class="sr-only"> (remove filter)</span></button>`).join('');

  const filtersButton = $('filters-btn');
  filtersButton.textContent = `Filters${names.length ? ` (${names.length})` : ''}`;
  filtersButton.classList.toggle('is-set', names.length > 0);

  const plural = names.length > 1 ? 's' : '';
  $('count').innerHTML = `<b>${shownRows.length}</b> of ${season.n} players` +
    (names.length ? ` &middot; ${names.length} filter${plural} active <button type="button" class="link" data-reset>Reset</button>` : '');
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
  view = null;
  $('table-wrap').hidden = true;
  $('state-panel').innerHTML = html;
  $('state-panel').hidden = false;
}

function renderMain() {
  const tab = currentTab();
  tooltip.hide();
  if (tabIsEmpty(tab, emptyKeys)) {
    showPanel(emptyTabHtml(tab.name, seasonText(), newestSeasonWithData(manifest, tab, state.type, state.season)));
  } else if (shownRows.length === 0) {
    showPanel(noResultsHtml());
  } else {
    renderTable(tab);
  }
}

function renderTable(tab) {
  const { shownKeys } = splitPickedColumns(tab, picksOf(tab), emptyKeys);
  const columns = [...manifest.base_columns, ...shownKeys].map((key) => columnsByKey.get(key));
  ensureSortColumn(columns);

  const rows = sortRows(shownRows, season, columnsByKey.get(state.sort.key), state.sort.direction);
  const rankTables = buildRankTables(columns, season, shownRows);
  view = { columns, season, rows, rankTables, sort: state.sort, bannerTitles, glossary };

  const { hasBanner, html } = tableHtml(view);
  $('grid').className = hasBanner ? 'has-group' : '';
  $('grid').innerHTML = html;
  $('state-panel').hidden = true;
  $('table-wrap').hidden = false;
  fitCurrentTable();
}

// Keeps the sort if its column is still on screen, otherwise sorts by the tab's first data column.
function ensureSortColumn(columns) {
  if (state.sort && columns.some((column) => column.key === state.sort.key)) return;
  const first = columns[manifest.base_columns.length] ?? columnsByKey.get('MP');
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
  $('picker-body').innerHTML = pickerHtml(tab, picksOf(tab), emptyKeys, columnsByKey, bannerTitles);
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
function setType(type) {
  const seasons = manifest.seasons[type];
  return showSeason(type, seasons.includes(state.season) ? state.season : seasons[0]);   // newest season if this one has no file
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
  const fresh = emptyFilters();
  for (const name of chipName === 'age' ? ['ageMin', 'ageMax'] : [chipName]) state.filters[name] = fresh[name];
  renderResults();
  syncFilterInputs(true);
  // After removing a chip, focus goes to its control, or to the Filters button while the phone filters are collapsed.
  const control = $(INPUT_OF_CHIP[chipName]);
  (control.offsetParent !== null ? control : $('filters-btn')).focus({ preventScroll: true });
}

function resetFilters() {
  state.filters = emptyFilters();
  renderResults();
  syncFilterInputs(true);
}

function sortBy(key, direction) {
  const column = columnsByKey.get(key);
  const sameColumn = state.sort && state.sort.key === key;
  const flipped = state.sort && state.sort.direction === 'asc' ? 'desc' : 'asc';
  state.sort = { key, direction: direction ?? (sameColumn ? flipped : naturalSortDirection(column)) };
  renderMain();
  $('grid').querySelector(`[data-sort="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });   // the header was re-rendered
}

function pickColumns(action) {
  const tab = currentTab();
  const wanted = (column) => action === 'all' || (action === 'default' && column.default_visible);
  state.picks.set(tab.name, new Set(tab.columns.filter(wanted).map((column) => column.key)));
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
  $('season').addEventListener('change', (event) => showSeason(state.type, event.target.value));
  $('filters-btn').addEventListener('click', () => setFiltersOpen(!state.filtersOpen));

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
    const key = event.target.dataset.pick;
    const picks = picksOf(currentTab());
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
  $('grid').addEventListener('click', (event) => {
    const header = event.target.closest('[data-sort]');
    if (header) sortBy(header.dataset.sort);
  });
  $('state-panel').addEventListener('click', (event) => {
    const jump = event.target.closest('[data-switch-season]');
    if (jump) showSeason(state.type, jump.dataset.switchSeason);
    if (event.target.closest('[data-retry]')) showSeason(retryRequest.type, retryRequest.seasonLabel);
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
function installTestHook() {
  window.AH_TEST = {
    setTab,
    setFilter: (name, value) => { setFilter(name, value); syncFilterInputs(true); },
    resetFilters,
    sortBy,
    setSeason: (seasonLabel) => showSeason(state.type, seasonLabel),
    setType,
    setTheme: (theme) => { if (document.documentElement.dataset.theme !== theme) $('theme').click(); },
    setFiltersOpen,
    pickColumns,
    visibleRows: () => (view ? view.rows.map((row) => season.id[row]) : []),
    visibleColumns: () => (view ? view.columns.map((column) => column.key) : []),
    rankOf: (entityId, key) => {   // works for any column of the season file, shown or not
      const row = season.id.indexOf(entityId);
      const column = columnsByKey.get(key);
      const value = season.cols[key][row];
      if (!shownRows.includes(row) || column.rank === 'none' || column.format === 'text' || value === null) return null;
      return lookupRank(buildRankTable(season.cols[key], shownRows, column.rank), value);
    },
    state: () => ({
      type: state.type, season: state.season, tab: state.tab, status, sort: state.sort, filtersOpen: state.filtersOpen,
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
  bannerTitles = indexBannerTitles(glossary);

  const requestedTab = new URLSearchParams(location.search).get('tab');   // the glossary links back with ?tab=
  state.tab = findTab(manifest, requestedTab) ? requestedTab : manifest.tabs[0].name;
  buildTabs($('tabs'), $('tab-select'), manifest.tabs);
  $('panel').setAttribute('aria-labelledby', `tab-${manifest.tabs.findIndex((tab) => tab.name === state.tab)}`);

  tooltip = setUpTooltip($('tip'), $('grid'), (key) => ({
    column: columnsByKey.get(key),
    tooltip: glossary.entries[key].tooltip,
  }));
  wireTabs();
  wireToolbar();
  wirePicker();
  wireTable();
  installTestHook();
  setFiltersOpen(false);

  await showSeason('rs', manifest.seasons.rs[0]);
  document.body.dataset.ready = 'true';
}

start();
