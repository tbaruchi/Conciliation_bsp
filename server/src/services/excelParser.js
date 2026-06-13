import * as XLSX from 'xlsx';
import { normalizeKey, parseAmount, parseDateValue } from '../utils/normalize.js';

const DATE_KEYS = ['data', 'data lancamento', 'data lanc', 'dt', 'data movimento', 'data do lancamento'];
const TITLE_KEYS = ['titulo', 'titulo/documento', 'numero do titulo', 'numero titulo'];
const DOC_KEYS = ['documento', 'numero documento', 'num documento', 'nro documento', 'numero', 'cheque', 'doc'];
const DESC_KEYS = ['historico', 'descricao', 'historico padrao', 'complemento', 'lancamento', 'descricao do lancamento', 'memo'];
const VALUE_KEYS = ['valor', 'valor (r$)', 'montante', 'valor r$', 'valor lancamento'];
const DEBIT_KEYS = ['debito', 'valor debito', 'debito (r$)'];
const CREDIT_KEYS = ['credito', 'valor credito', 'credito (r$)'];

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i] || [];
    const normalized = row.map((c) => normalizeKey(c));
    const hasDate = normalized.some((c) => DATE_KEYS.includes(c));
    const hasValue = normalized.some(
      (c) => VALUE_KEYS.includes(c) || DEBIT_KEYS.includes(c) || CREDIT_KEYS.includes(c)
    );
    if (hasDate && hasValue) {
      return i;
    }
  }
  return -1;
}

function buildColumnMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, idx) => {
    const key = normalizeKey(cell);
    if (DATE_KEYS.includes(key) && map.date === undefined) map.date = idx;
    else if (TITLE_KEYS.includes(key) && map.title === undefined) map.title = idx;
    else if (DOC_KEYS.includes(key) && map.document === undefined) map.document = idx;
    else if (DESC_KEYS.includes(key) && map.description === undefined) map.description = idx;
    else if (VALUE_KEYS.includes(key) && map.value === undefined) map.value = idx;
    else if (DEBIT_KEYS.includes(key) && map.debit === undefined) map.debit = idx;
    else if (CREDIT_KEYS.includes(key) && map.credit === undefined) map.credit = idx;
  });
  return map;
}

/**
 * Parses an .xlsx/.xls buffer into a normalized list of entries.
 * Returns: [{ title, document, description, date, value }]
 */
export function parseExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

  const headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) {
    throw new Error('Não foi possível identificar as colunas de Data e Valor na planilha.');
  }

  const columnMap = buildColumnMap(rows[headerIdx]);
  const entries = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === '' || c === null || c === undefined)) continue;

    const date = columnMap.date !== undefined ? parseDateValue(row[columnMap.date]) : null;

    let value = null;
    if (columnMap.value !== undefined) {
      value = parseAmount(row[columnMap.value]);
    } else if (columnMap.debit !== undefined || columnMap.credit !== undefined) {
      const debit = columnMap.debit !== undefined ? parseAmount(row[columnMap.debit]) || 0 : 0;
      const credit = columnMap.credit !== undefined ? parseAmount(row[columnMap.credit]) || 0 : 0;
      value = credit - debit;
    }

    if (value === null || value === 0 || Number.isNaN(value)) continue;

    const titleParts = [];
    if (columnMap.title !== undefined && row[columnMap.title] !== '') titleParts.push(String(row[columnMap.title]).trim());
    if (columnMap.document !== undefined && row[columnMap.document] !== '') titleParts.push(String(row[columnMap.document]).trim());

    const description =
      columnMap.description !== undefined && row[columnMap.description] !== ''
        ? String(row[columnMap.description]).trim()
        : '';

    const title = titleParts.length > 0 ? titleParts.join(' - ') : description || `Linha ${i + 1}`;

    entries.push({
      title,
      document: columnMap.document !== undefined ? String(row[columnMap.document] ?? '').trim() : '',
      description: description || title,
      date,
      value: Math.round(value * 100) / 100,
    });
  }

  return entries;
}
