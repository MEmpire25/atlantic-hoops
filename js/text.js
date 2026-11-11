// Small text helpers shared by both pages.

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]
  ));
}

// Lower-case and accent-free, so "jokic" finds "Jokić".
export function normalizeForSearch(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Column keys contain characters such as % + / : that are awkward in URLs and ids, so every character that is not a
// letter or digit becomes _<hex>_. The result is unique per key and safe in a "#col-..." link.
export function columnAnchorId(key) {
  const safe = key.replace(/[^A-Za-z0-9]/g, (character) => `_${character.charCodeAt(0).toString(16)}_`);
  return `col-${safe}`;
}

export function glossaryLink(key) {
  return `glossary.html#${columnAnchorId(key)}`;
}
