// The player tile: a panel over the stats page with one player's seasons (a table like the stats table) and, once a
// numeric column is sorted, a box plot per season. The flow, top to bottom:
//   load the player file (data.js) -> pick the columns (tab + picker, shared with the stats table) -> sort -> render the table
//   (player-table.js) -> load that column's box numbers -> render the chart (box-chart.js)
//
// The tile has an address, ?player=<EntityId> next to whatever else is in the URL. Opening it adds a history entry, so the
// browser's Back button (and a phone's back gesture) closes it and lands on the same table view; a link that already has
// the parameter opens the page with the tile open. Nothing on the stats page changes while the tile is open.
//
// `host` is what the tile shares with the stats page (main.js): the manifest and column lookups, the tab, season type,
// rank mode and column choice the visitor already made, and the phone breakpoint.
import { loadPlayer, loadBoxes } from './data.js?v=a8a25cf21f';
import { findTab } from './columns.js?v=a8a25cf21f';
import { buildTabs, updateTabs, wireTabKeys } from './tabs.js?v=a8a25cf21f';
import { pickerHtml, pickerLabel } from './picker.js?v=a8a25cf21f';
import { naturalSortDirection, sortRows } from './sorting.js?v=a8a25cf21f';
import { playerCellRanking } from './ranks.js?v=a8a25cf21f';
import { BLANK_MARK } from './table.js?v=a8a25cf21f';
import { escapeHtml } from './text.js?v=a8a25cf21f';
import { playerTableHtml } from './player-table.js?v=a8a25cf21f';
import { drawBoxChart, chartKeyHtml } from './box-chart.js?v=a8a25cf21f';
import { SEASON_TYPE_NAME, SEASON_COUNT_WORD, NO_VALUES_NOTICE } from './player-copy.js?v=a8a25cf21f';

const PLAYER_PARAM = 'player';
const SEASON_KEY = 'Season';
const RESIZE_DELAY_MS = 120;
const COPIED_MESSAGE_MS = 1500;
const PICKER_GAP_PX = 4;              // the picker sits this far under the Columns button (site.css)
const PICKER_BOTTOM_MARGIN_PX = 12;   // and stops this far above the tile's bottom edge
const PICKER_MIN_HEIGHT_PX = 160;
const TABLE_FLOOR_PX = 200;           // the least height the table is squeezed to beside the chart in tall windows
const NO_EMPTY_COLUMNS = new Set();   // the tile shows every column the visitor picked, with dashes where the player has no value

const $ = (id) => document.getElementById(id);

const RANK_LEGEND = ['top 10%', 'next 20%', 'middle 40%', 'next 20%', 'bottom 10%'];
const PERCENTILE_LEGEND = ['90–100', '70–89', '30–69', '10–29', '0–9'];

export function setUpPlayerTile(host) {
  const scrim = $('tile-scrim');
  let openId = null;       // EntityId (as text) of the tile on screen, null while closed
  let status = 'closed';   // closed | loading | ready | not-found | error
  let player = null;       // the player file, once loaded
  let type = 'rs';
  let tab = null;
  let sort = null;         // { key, direction }, or null = newest season first and no chart
  let trigger = null;      // the name link that opened the tile, to give focus back to
  let pageTitle = '';
  let chartTicket = 0;     // a chart still loading is dropped when a newer one was asked for
  let drawnChartLayout = null;

  // ---------- opening and closing ----------
  function urlWithPlayer(id) {
    const url = new URL(location.href);
    if (id === null) url.searchParams.delete(PLAYER_PARAM); else url.searchParams.set(PLAYER_PARAM, id);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function open(entityId, linkElement) {
    trigger = linkElement;
    history.pushState({ tile: true }, '', urlWithPlayer(entityId));
    show(String(entityId));
  }

  // Closing goes back one history step when this page added the tile's entry; a page that was opened on a ?player= link has
  // no earlier entry of its own, so the parameter is removed in place.
  function close() {
    if (openId === null) return;
    hide();
    if (history.state?.tile) history.back(); else history.replaceState(history.state, '', urlWithPlayer(null));
  }

  // Makes the screen match the address: tile open for ?player=<id>, closed without it (Back, Forward, a pasted link).
  function showFromUrl() {
    const id = new URLSearchParams(location.search).get(PLAYER_PARAM);
    if (id === null) hide(); else show(id);
  }

  async function show(id) {
    if (id === openId) return;
    const wasClosed = openId === null;
    openId = id;
    player = null;
    status = 'loading';
    chartTicket++;   // a chart still loading belongs to the previous player
    if (wasClosed) {
      pageTitle = document.title;
      type = host.type();
      tab = host.tab();
      sort = null;
      setBackgroundInert(true);
    }
    scrim.hidden = false;
    render();
    // Focus starts on the tile itself, just before its header, so Tab reaches Copy link, then Close, then the tabs.
    if (wasClosed) $('tile').focus();

    let loaded = null;
    let loadFailed = false;
    try {
      loaded = await loadPlayer(id);
    } catch (error) {
      loadFailed = true;
    }
    if (id !== openId) return;   // closed or replaced while the file loaded
    player = loaded;
    status = loadFailed ? 'error' : player ? 'ready' : 'not-found';
    if (player && !player[type]) type = type === 'rs' ? 'po' : 'rs';   // a link opens on the season type the player has
    render();
  }

  function hide() {
    if (openId === null) return;
    openId = null;
    player = null;
    status = 'closed';
    chartTicket++;
    drawnChartLayout = null;
    scrim.hidden = true;
    setBackgroundInert(false);
    closePicker();
    document.title = pageTitle;
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    trigger = null;
  }

  // The stats page stays where it is but cannot be reached by keyboard or screen reader while the tile is open.
  function setBackgroundInert(on) {
    for (const element of document.body.children) {
      if (element !== scrim) element.inert = on;
    }
  }

  // ---------- header block ----------
  // Rows of both season types, newest first; within a season the playoffs row counts as the later one.
  function rowsNewestFirst() {
    const rows = ['rs', 'po'].flatMap((seasonType) => (player[seasonType]?.seasons ?? []).map((season, index) => ({ seasonType, season, index })));
    return rows.sort((a, b) => b.season.localeCompare(a.season) || (a.seasonType === 'po' ? -1 : 1));
  }

  function renderHeader() {
    const message = { loading: 'Loading…', 'not-found': 'Player not found', error: 'Could not load this player' }[status];
    $('tile-name').textContent = message ?? '';
    $('tile-facts').innerHTML = '';
    $('tile-copy').hidden = status !== 'ready';
    if (status !== 'ready') return;

    const rows = rowsNewestFirst();
    const latest = (key) => {
      const row = rows.find(({ seasonType, index }) => player[seasonType].cols[key][index] !== null);
      return row ? player[row.seasonType].cols[key][row.index] : BLANK_MARK;
    };
    const seasonCount = (seasonType) => player[seasonType]?.seasons.length ?? 0;
    $('tile-name').textContent = latest('Player');
    $('tile-facts').innerHTML = [
      ['Last team', latest('Team')],
      ['Pos', latest('Pos')],
      ['Age', latest('Age')],
      ['Seasons', `${rows[rows.length - 1].season} to ${rows[0].season}`],
      ['Played', `${seasonCount('rs')} RS, ${seasonCount('po')} PO`],
    ].map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
    document.title = `${$('tile-name').textContent} – Atlantic Hoops`;
  }

  // ---------- controls ----------
  function renderControls() {
    const tabs = host.manifest.tabs;
    updateTabs($('tile-tabs'), $('tile-tab-select'), tabs, tab, NO_EMPTY_COLUMNS);
    for (const button of scrim.querySelectorAll('[data-tile-type]')) button.setAttribute('aria-pressed', String(button.dataset.tileType === type));
    for (const button of scrim.querySelectorAll('[data-tile-mode]')) button.setAttribute('aria-pressed', String(button.dataset.tileMode === host.rankMode()));
    renderPicker();
    const labels = host.rankMode() === 'percentile' ? PERCENTILE_LEGEND : RANK_LEGEND;
    $('tile-legend').innerHTML = `<span class="muted">${host.rankMode() === 'percentile' ? 'Percentile' : 'Rank'} among all players that season:</span>` +
      labels.map((label, index) => `<span class="rank r${index + 1}">${label}</span>`).join('');
  }

  function renderPicker() {
    const tabDefinition = findTab(host.manifest, tab);
    $('tile-picker-body').innerHTML = pickerHtml(tabDefinition, host.picksOf(tab), host.infoColumns, host.infoPicksOf(tab), NO_EMPTY_COLUMNS, host.columnsByKey, host.bannerTitles);
    $('tile-picker-btn').textContent = pickerLabel(tabDefinition, host.picksOf(tab), NO_EMPTY_COLUMNS);
  }

  function setPickerOpen(isOpen) {
    $('tile-picker').hidden = !isOpen;
    $('tile-picker-btn').setAttribute('aria-expanded', String(isOpen));
    fitPickerToTile();
  }

  // The tile clips what sticks out of it, so the open picker may be no taller than the room left under the Columns button
  // (it scrolls inside if its list is longer). On a phone the picker is a bottom sheet with its own limit in site.css.
  function fitPickerToTile() {
    const picker = $('tile-picker');
    picker.style.maxHeight = '';
    if (picker.hidden || host.isPhone()) return;
    const roomBelowButton = $('tile').getBoundingClientRect().bottom - $('tile-picker-btn').getBoundingClientRect().bottom - PICKER_GAP_PX - PICKER_BOTTOM_MARGIN_PX;
    picker.style.maxHeight = `${Math.max(PICKER_MIN_HEIGHT_PX, Math.floor(roomBelowButton))}px`;
  }

  const closePicker = () => setPickerOpen(false);

  // ---------- table ----------
  function renderTable() {
    const block = player[type];
    const typeName = SEASON_TYPE_NAME[type];
    const seasonCount = block?.seasons.length ?? 0;
    $('tile-count').textContent = `${seasonCount} ${SEASON_COUNT_WORD[type]}${seasonCount === 1 ? '' : 's'}. Ranks compare the player with everyone above the minutes floor that season.`;
    $('tile-empty').hidden = seasonCount > 0;
    $('tile-table-wrap').hidden = seasonCount === 0;
    $('tile-note').hidden = true;
    if (seasonCount === 0) {
      $('tile-empty').innerHTML = `<h3>No ${typeName} seasons</h3><div>${escapeHtml($('tile-name').textContent)} has no ${typeName} season above the minutes floor.</div>`;
      return;
    }

    // Season first (frozen), then the player-info columns and the tab's columns the visitor picked.
    const infoPicks = host.infoPicksOf(tab);
    const statPicks = host.picksOf(tab);
    const infoKeys = host.infoColumns.map((column) => column.key).filter((key) => infoPicks.has(key));
    const statKeys = findTab(host.manifest, tab).columns.map((column) => column.key).filter((key) => statPicks.has(key));
    const columns = [SEASON_KEY, ...infoKeys, ...statKeys].map((key) => host.columnsByKey.get(key));
    if (sort && !columns.some((column) => column.key === sort.key)) sort = null;   // the sorted column was unticked
    const hasAnyValue = statKeys.some((key) => block.cols[key].some((value) => value !== null));
    $('tile-note').textContent = NO_VALUES_NOTICE;
    $('tile-note').hidden = hasAnyValue || statKeys.length === 0;

    const seasonsAsRows = block.seasons.map((unused, index) => index);   // already newest first
    const rows = sort ? sortRows(seasonsAsRows, block, host.columnsByKey.get(sort.key), sort.direction) : seasonsAsRows;
    $('tile-grid').innerHTML = playerTableHtml({ columns, block, rows, sort, mode: host.rankMode(), inProgressSeason: host.manifest.in_progress[type] });
    fitTableFloor();
  }

  // In tall windows with the chart shown, the table may shrink to 200px to leave room for the chart; a table that needs less
  // keeps its own height, or its frame would show blank rows (the floor is read in player-tile.css). What the frame needs is
  // the rows plus what surrounds them: its border and, in a narrow window, the horizontal scrollbar (offsetHeight minus
  // clientHeight; a vertical scrollbar does not count). That sum is only right when the layout has settled: a frame that
  // shrinks to a too-small floor gains a horizontal scrollbar and scrolls inside itself, so the floor is raised once by what
  // the frame then misses. It runs again once the chart is drawn, because the chart is what makes the frame short.
  function fitTableFloor() {
    const frame = $('tile-table-wrap');
    if (frame.hidden) return;
    const setFloor = (pixels) => frame.style.setProperty('--table-floor', `${Math.min(TABLE_FLOOR_PX, pixels)}px`);
    const floor = $('tile-grid').offsetHeight + frame.offsetHeight - frame.clientHeight;
    setFloor(floor);
    setFloor(floor + Math.max(0, frame.scrollHeight - frame.clientHeight));   // reading the sizes applies the first floor
  }

  // ---------- chart ----------
  function boxAt(boxes, index) {
    if (boxes.n[index] === 0) return null;   // nobody has a value that season
    const { q1, med, q3, lo, hi, out } = boxes;
    return { q1: q1[index], med: med[index], q3: q3[index], lo: lo[index], hi: hi[index], out: out[index] };
  }

  // One entry per season from the player's first to last season of this type, oldest first. Seasons in between with no
  // row of his (below the minutes floor) keep the league box and get no marker.
  function chartEntries(column, boxes) {
    const block = player[type];
    const seasons = host.manifest.seasons[type];   // newest first
    const newest = seasons.indexOf(block.seasons[0]);
    const oldest = seasons.indexOf(block.seasons[block.seasons.length - 1]);
    return seasons.slice(newest, oldest + 1).reverse().map((season) => {
      const boxIndex = boxes.seasons.indexOf(season);
      const rowIndex = block.seasons.indexOf(season);
      const value = rowIndex >= 0 ? block.cols[column.key][rowIndex] : null;
      const ranking = value === null ? null : playerCellRanking(block, column.key, rowIndex, host.rankMode());
      return {
        season,
        live: season === host.manifest.in_progress[type],
        box: boxAt(boxes, boxIndex),
        hasRow: rowIndex >= 0,
        marker: value === null ? null : { value, rank: ranking?.rank ?? null, percentile: ranking?.percentile ?? null, number: ranking?.number ?? null, step: ranking?.step ?? null },
      };
    });
  }

  // The chart shows for a sorted numeric column; sorting Season, Team or Pos leaves it hidden.
  function chartColumn() {
    const column = sort ? host.columnsByKey.get(sort.key) : null;
    return player[type] && column && column.format !== 'text' ? column : null;
  }

  async function renderChart() {
    const ticket = ++chartTicket;
    const column = chartColumn();
    $('tile-chart').hidden = !column;
    $('tile-body').classList.toggle('has-chart', column !== null);
    if (!column) {
      $('tile-chart').innerHTML = '';
      drawnChartLayout = null;
      return;
    }
    $('tile-chart').innerHTML = `<div class="c-head"><h3>${escapeHtml(column.name)} by season</h3>` +
      `<span class="c-sub">${SEASON_TYPE_NAME[type]}, all players above the minutes floor</span>` +
      '<button type="button" class="link-btn" data-hide-chart>Hide chart</button></div>' +
      '<div class="c-plot" id="tile-plot"></div><div class="c-key" id="tile-key"></div>';

    let boxes;
    try {
      boxes = await loadBoxes(type, column.key);
    } catch (error) {
      if (ticket === chartTicket) $('tile-plot').innerHTML = '<div class="panel-msg"><h3>Could not load the chart</h3><div>Try again in a moment.</div></div>';
      return;
    }
    if (ticket !== chartTicket) return;

    const entries = chartEntries(column, boxes);
    const phone = host.isPhone();
    const drawn = drawBoxChart($('tile-plot'), entries, column, { mode: host.rankMode(), phone });
    drawnChartLayout = chartLayout(phone);
    if (!drawn) {
      $('tile-plot').innerHTML = `<div class="panel-msg"><h3>No league data for this column</h3><div>None of ${escapeHtml($('tile-name').textContent)}'s ${SEASON_TYPE_NAME[type]} seasons has data for ${escapeHtml(column.name)}.</div></div>`;
      $('tile-key').hidden = true;
      return;
    }
    const withoutLeagueData = entries.filter((entry) => entry.box === null).length;
    $('tile-key').innerHTML = chartKeyHtml({
      noRank: column.rank === 'none',
      noLeagueSeasons: withoutLeagueData > 0 ? { count: withoutLeagueData, of: entries.length } : null,
    });
    fitTableFloor();
  }

  // What the drawing depends on: its width, and on wide screens the window height too. A resize that changes neither keeps the chart.
  function chartLayout(phone) {
    return phone ? `rows ${$('tile-chart').clientWidth}` : `columns ${$('tile-chart').clientWidth} ${window.innerHeight}`;
  }

  function redrawChartIfLayoutChanged() {
    if (status === 'ready' && drawnChartLayout !== null && chartLayout(host.isPhone()) !== drawnChartLayout) return renderChart();
  }

  // ---------- rendering ----------
  function render() {
    renderHeader();
    const ready = status === 'ready';
    $('tile-main').hidden = !ready;
    $('tile-state').hidden = ready || status === 'loading';
    $('tile-state').innerHTML = {
      'not-found': '<h3>Player not found</h3><div>There is no player with this id. Close this and pick a player from the table.</div>',
      error: '<h3>Could not load this player</h3><div>Check your connection and open the player again.</div>',
    }[status] ?? '';
    if (ready) refresh();
  }

  // Everything below the header, after any choice in the tile.
  function refresh() {
    renderControls();
    renderTable();
    // The chart is drawn after its data arrives and the tile (content-height in tall windows) grows with it, so the picker is
    // fitted once that has happened; fitting earlier would measure the tile while the chart is still empty and too short.
    // This also covers the toolbar wrapping differently after a choice, which moves the Columns button.
    renderChart().then(fitPickerToTile);
  }

  // ---------- events ----------
  function sortBy(key) {
    const sameColumn = sort?.key === key;
    const flipped = sort?.direction === 'asc' ? 'desc' : 'asc';
    sort = { key, direction: sameColumn ? flipped : naturalSortDirection(host.columnsByKey.get(key)) };
    refresh();
  }

  async function copyLink() {
    const button = $('tile-copy');
    try {
      await navigator.clipboard.writeText(location.href);   // not available on a page without a secure connection
      button.textContent = 'Link copied';
    } catch (error) {
      button.textContent = 'Could not copy';
    }
    setTimeout(() => { button.textContent = 'Copy link'; }, COPIED_MESSAGE_MS);
  }

  function selectTab(name) {
    if (!findTab(host.manifest, name)) return;
    tab = name;
    refresh();
  }

  function onClick(event) {
    const target = event.target;
    if (target === scrim || target.closest('#tile-close')) return close();
    if (target.closest('#tile-copy')) return copyLink();
    if (target.closest('#tile-picker-btn')) return setPickerOpen($('tile-picker').hidden);
    if (!target.closest('#tile-picker')) closePicker();

    const tabButton = target.closest('[data-tab]');
    const typeButton = target.closest('[data-tile-type]');
    const modeButton = target.closest('[data-tile-mode]');
    const sortButton = target.closest('[data-sort]');
    const pickAction = target.closest('[data-pick-action]');
    if (tabButton) selectTab(tabButton.dataset.tab);
    else if (typeButton) { type = typeButton.dataset.tileType; refresh(); }
    else if (modeButton) { host.setRankMode(modeButton.dataset.tileMode); refresh(); }   // one choice for the stats page and the tile
    else if (sortButton) sortBy(sortButton.dataset.sort);
    else if (target.closest('[data-hide-chart]')) { sort = null; refresh(); }
    else if (pickAction) { host.pickColumns(pickAction.dataset.pickAction, tab); refresh(); }
  }

  function onChange(event) {
    const infoKey = event.target.dataset.infoPick;
    const key = infoKey ?? event.target.dataset.pick;
    if (key !== undefined) {
      const picks = infoKey ? host.infoPicksOf(tab) : host.picksOf(tab);
      if (event.target.checked) picks.add(key); else picks.delete(key);
      host.picksChanged();
      refresh();
    } else if (event.target.id === 'tile-tab-select') {
      selectTab(event.target.value);
    }
  }

  function onKeydown(event) {
    if (openId === null || event.key !== 'Escape') return;
    event.preventDefault();
    if ($('tile-picker').hidden) { close(); return; }
    closePicker();
    $('tile-picker-btn').focus();
  }

  buildTabs($('tile-tabs'), $('tile-tab-select'), host.manifest.tabs, 'tile-tab');
  wireTabKeys($('tile-tabs'), host.manifest.tabs, () => tab, selectTab);
  scrim.addEventListener('click', onClick);
  scrim.addEventListener('change', onChange);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('popstate', showFromUrl);
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    // The picker is fitted once a redrawn chart has settled the tile's height (see refresh).
    resizeTimer = setTimeout(async () => { const redrawn = redrawChartIfLayoutChanged(); fitTableFloor(); await redrawn; fitPickerToTile(); }, RESIZE_DELAY_MS);
  });

  return {
    open,
    showFromUrl,
    state: () => ({ open: openId !== null, id: openId, status, type, tab, sort, hasChart: !$('tile-chart').hidden }),
  };
}
