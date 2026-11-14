// Glossary page. One section per stats tab, in tab order. Columns with a glossary text get a full entry; the others
// (the self-evident ones) are listed compactly with their tooltip. Every column has an anchor, so every header
// tooltip on the stats page can link to the right place. All text comes from glossary.json.
import { loadManifest, loadGlossary } from './data.js?v=b3e8ff2edc';
import { indexColumnsByKey, indexBannerTitles } from './columns.js?v=b3e8ff2edc';
import { escapeHtml, columnAnchorId } from './text.js?v=b3e8ff2edc';

const byName = (a, b) => a.name.localeCompare(b.name);

function entryHtml(column, text, bannerTitle) {
  return `<article class="entry" id="${columnAnchorId(column.key)}">` +
    `<h3>${escapeHtml(column.name)}${bannerTitle ? `<span class="group-name">${escapeHtml(bannerTitle)}</span>` : ''}</h3>` +
    `<p>${escapeHtml(text.glossary)}</p>` +
    (text.how_to_read ? `<p class="read"><b>How to read:</b> ${escapeHtml(text.how_to_read)}</p>` : '') +
    (text.credit ? `<p class="credit"><b>Source:</b> ${escapeHtml(text.credit)}</p>` : '') +
    '</article>';
}

function compactItemHtml(column, text) {
  return `<li id="${columnAnchorId(column.key)}"><b>${escapeHtml(column.name)}</b> ${escapeHtml(text.tooltip)}</li>`;
}

function sectionHtml(id, title, tabName, columns, glossary, bannerTitles) {
  const withEntry = columns.filter((column) => glossary.entries[column.key].glossary).sort(byName);
  const withoutEntry = columns.filter((column) => !glossary.entries[column.key].glossary).sort(byName);
  const statsLink = tabName ? `<a href="index.html?tab=${encodeURIComponent(tabName)}">View on the stats page</a>` : '';
  return `<section id="${id}"><h2>${escapeHtml(title)}${statsLink}</h2>` +
    withEntry.map((column) => entryHtml(column, glossary.entries[column.key], bannerTitles.get(column.key))).join('') +
    (withoutEntry.length
      ? `<h3 class="compact-title">Also in this section</h3><ul class="compact">${withoutEntry.map((column) => compactItemHtml(column, glossary.entries[column.key])).join('')}</ul>`
      : '') +
    '</section>';
}

// Jump to the entry named in the link and highlight it. The browser only does this itself for ids that exist when the
// page loads (and its :target highlight is unreliable then), but the entries are created after the data arrives.
// The web font changes the height of everything above the entry when it arrives, so the page scrolls again then.
function scrollToLinkedEntry() {
  const linked = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (!linked) return;
  linked.classList.add('is-linked');
  linked.scrollIntoView();
  document.fonts.ready.then(() => linked.scrollIntoView());
}

async function start() {
  const [manifest, glossary] = await Promise.all([loadManifest(), loadGlossary()]);
  const columnsByKey = indexColumnsByKey(manifest);
  const bannerTitles = indexBannerTitles(glossary);

  // A column used in two tabs (NonHeave3P%) is described once, in the first tab that has it.
  const placed = new Set();
  const sections = manifest.tabs.map((tab, index) => {
    const columns = tab.columns.map(({ key }) => columnsByKey.get(key)).filter((column) => !placed.has(column.key));
    columns.forEach((column) => placed.add(column.key));
    return { id: `section-${index}`, title: tab.name, tabName: tab.name, columns };
  });
  sections.push({
    id: 'section-all-tables',
    title: 'Shown on every tab',
    tabName: null,
    columns: manifest.base_columns.map((key) => columnsByKey.get(key)),
  });

  document.getElementById('section-nav').innerHTML = sections
    .map((section) => `<li><a href="#${section.id}">${escapeHtml(section.title)}</a></li>`).join('');
  document.getElementById('sections').innerHTML = sections
    .map((section) => sectionHtml(section.id, section.title, section.tabName, section.columns, glossary, bannerTitles)).join('');
  scrollToLinkedEntry();
}

start().catch(() => {
  document.getElementById('sections').textContent = 'Could not load the glossary. Check your connection and reload the page.';
});
