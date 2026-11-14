// Filter state and the filtering step: season file + filters -> indexes of the rows to show (source order).
// Ranks are computed over exactly this set.
import { normalizeForSearch } from './text.js?v=5afac4d2e6';

export function emptyFilters() {
  return { pos: '', team: '', minMp: null, minGp: null, ageMin: null, ageMax: null, search: '' };
}

// Names of the filters that are currently narrowing the table. Drives the chips and the "Filters (n)" button.
export function activeFilterNames(filters) {
  const names = [];
  if (filters.pos) names.push('pos');
  if (filters.team) names.push('team');
  if (filters.minMp !== null) names.push('minMp');
  if (filters.minGp !== null) names.push('minGp');
  if (filters.ageMin !== null || filters.ageMax !== null) names.push('age');
  if (filters.search.trim()) names.push('search');
  return names;
}

// Text of the removable chip for an active filter (see activeFilterNames).
export function chipLabel(name, filters) {
  switch (name) {
    case 'pos': return `Pos: ${filters.pos}`;
    case 'team': return `Team: ${filters.team}`;
    case 'minMp': return `MP ≥ ${filters.minMp}`;
    case 'minGp': return `GP ≥ ${filters.minGp}`;
    case 'search': return `“${filters.search.trim()}”`;
    default: return `Age ${ageRangeText(filters)}`;
  }
}

function ageRangeText({ ageMin, ageMax }) {
  if (ageMin !== null && ageMax !== null) return `${ageMin}–${ageMax}`;
  return ageMin !== null ? `${ageMin} or older` : `${ageMax} or younger`;
}

export function filterRows(season, filters) {
  const { Pos, Team, MP, GP, Age } = season.cols;
  const searchText = normalizeForSearch(filters.search.trim());
  const ageFilterOn = filters.ageMin !== null || filters.ageMax !== null;
  const shown = [];

  for (let row = 0; row < season.n; row++) {
    if (filters.pos && Pos[row] !== filters.pos) continue;
    if (filters.team && Team[row] !== filters.team) continue;
    if (filters.minMp !== null && !(MP[row] >= filters.minMp)) continue;
    if (filters.minGp !== null && !(GP[row] >= filters.minGp)) continue;
    if (ageFilterOn && !passesAgeRange(Age[row], filters)) continue;
    if (searchText && !season.searchNames[row].includes(searchText)) continue;
    shown.push(row);
  }
  return shown;
}

// A blank Age is excluded only when an age bound is set.
function passesAgeRange(age, filters) {
  if (age === null) return false;
  if (filters.ageMin !== null && age < filters.ageMin) return false;
  if (filters.ageMax !== null && age > filters.ageMax) return false;
  return true;
}
