// Number display. The data files are already rounded and scaled; this only formats.

const MINUS = '−';   // a true minus sign, never a hyphen

function formatMagnitude(magnitude, format) {
  switch (format) {
    case 'int': return Math.round(magnitude).toLocaleString('en-US');
    case '1dp': return magnitude.toFixed(1);
    case '2dp': return magnitude.toFixed(2);
    case 'pct1': return `${magnitude.toFixed(1)}%`;
    default: return String(magnitude);
  }
}

// `column` is the manifest entry. "+" is shown on positive values of columns flagged `signed` (they cross zero).
export function formatValue(value, column) {
  const text = formatMagnitude(Math.abs(value), column.format);
  if (value < 0) return MINUS + text;
  if (value > 0 && column.signed) return `+${text}`;
  return text;
}
