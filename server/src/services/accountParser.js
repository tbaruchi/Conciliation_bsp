import * as XLSX from 'xlsx';
import { normalizeKey, parseAmount } from '../utils/normalize.js';

const ACCOUNT_KEYS = [
  'conta',
  'conta contabil',
  'cod conta',
  'cod. conta',
  'codigo',
  'codigo conta',
  'codigo da conta',
  'conta reduzida',
  'cta',
  'classificacao',
];
const NAME_KEYS = [
  'fornecedor',
  'nome fornecedor',
  'nome do fornecedor',
  'razao social',
  'nome',
  'descricao',
  'nome da conta',
  'titulo da conta',
  'historico',
  'cliente',
];
const VALUE_KEYS = [
  'total',
  'valor total',
  'saldo',
  'saldo atual',
  'saldo final',
  'saldo atual (r$)',
  'saldo final (r$)',
  'saldo (r$)',
  'valor atual',
  'valor',
  'montante',
];

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i] || [];
    const normalized = row.map((c) => normalizeKey(c));
    const hasAccount = normalized.some((c) => ACCOUNT_KEYS.includes(c));
    const hasValue = normalized.some((c) => VALUE_KEYS.includes(c));
    if (hasAccount && hasValue) {
      return i;
    }
  }
  return -1;
}

function buildColumnMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, idx) => {
    const key = normalizeKey(cell);
    if (ACCOUNT_KEYS.includes(key) && map.account === undefined) map.account = idx;
    else if (NAME_KEYS.includes(key) && map.name === undefined) map.name = idx;
    else if (VALUE_KEYS.includes(key) && map.value === undefined) map.value = idx;
  });
  return map;
}

function findDataSheet(workbook) {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    const headerIdx = findHeaderRow(rows);
    if (headerIdx !== -1) {
      return { rows, headerIdx };
    }
  }
  return null;
}

/**
 * Parses an .xlsx/.xls buffer with account balances into a normalized list of entries.
 * Returns: [{ account, name, value }]
 */
export function parseAccountBalances(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  const dataSheet = findDataSheet(workbook);
  if (!dataSheet) {
    throw new Error('Não foi possível identificar as colunas de Conta e Total/Saldo na planilha.');
  }
  const { rows, headerIdx } = dataSheet;

  const columnMap = buildColumnMap(rows[headerIdx]);
  const entries = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === '' || c === null || c === undefined)) continue;

    const account = String(row[columnMap.account] ?? '').trim();
    if (!account) continue;

    let value = parseAmount(row[columnMap.value]);
    if (value === null || Number.isNaN(value)) continue;

    // Many balancetes report "Saldo atual" as an unsigned magnitude, with the actual
    // debit/credit sign carried in the very next column ("D"/"C"). When present, that
    // marker is authoritative — a "D" balance on a credit-normal (liability) account
    // offsets rather than adds to the group total, so it must be treated as negative.
    const signMarker = String(row[columnMap.value + 1] ?? '').trim().toUpperCase();
    if (signMarker === 'D') value = -Math.abs(value);
    else if (signMarker === 'C') value = Math.abs(value);

    const name = columnMap.name !== undefined ? String(row[columnMap.name] ?? '').trim() : '';

    entries.push({
      account,
      name,
      value: Math.round(value * 100) / 100,
    });
  }

  return entries;
}
