export function stripAccents(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function normalizeKey(str) {
  return stripAccents(String(str || ''))
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Parses a number that may be in Brazilian (1.234,56) or US (1,234.56) format.
export function parseAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;

  let str = String(value).trim();
  if (!str) return null;

  let negative = false;
  if (/^\(.*\)$/.test(str)) {
    negative = true;
    str = str.slice(1, -1);
  }

  // Trailing D/C indicators (Debito/Credito) commonly used in bank statements.
  const trailingMatch = str.match(/\s*([DC])\s*$/i);
  if (trailingMatch) {
    if (trailingMatch[1].toUpperCase() === 'D') negative = true;
    str = str.slice(0, trailingMatch.index).trim();
  }

  str = str.replace(/[^0-9.,-]/g, '');
  if (!str) return null;

  if (str.startsWith('-')) {
    negative = true;
    str = str.slice(1);
  }

  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');

  if (lastComma > -1 && lastComma > lastDot) {
    // Brazilian format: '.' thousand separator, ',' decimal separator
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > -1 && lastDot > lastComma) {
    // US format: ',' thousand separator, '.' decimal separator
    str = str.replace(/,/g, '');
  } else {
    str = str.replace(/,/g, '');
  }

  const num = parseFloat(str);
  if (Number.isNaN(num)) return null;
  return negative ? -num : num;
}

// Parses dates in dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd or Excel serial number formats.
export function parseDateValue(value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    // Excel serial date (days since 1899-12-30)
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(epoch.getTime() + value * 86400000);
    return date.toISOString().slice(0, 10);
  }

  const str = String(value).trim();

  let match = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (match) {
    let [, d, m, y] = match;
    if (y.length === 2) y = `20${y}`;
    return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return str || null;
}
