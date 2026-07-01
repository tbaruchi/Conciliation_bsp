import * as XLSX from 'xlsx';
import { normalizeKey, parseAmount } from '../utils/normalize.js';

const CODE_KEYS = [
  'codigo',
  'cod',
  'codigo cliente',
  'cod cliente',
  'codigo do cliente',
  'cod. cliente',
  'cod cli',
  'matricula',
  'codigo-nome do cliente',
  'codigo-lj-nome do cliente',
];
const ACCOUNT_KEYS = [
  'conta',
  'conta contabil',
  'cod conta',
  'cod. conta',
  'codigo conta',
  'codigo da conta',
  'conta reduzida',
  'cta',
  'classificacao',
  'c contabil',
  'c. contabil',
  'c cta',
  'cta contabil',
];
const NAME_KEYS = [
  'nome cliente',
  'nome do cliente',
  'razao social',
  'nome',
  'nome abreviado',
  'descricao',
  'cliente',
];
const VALUE_KEYS = ['total', 'valor total', 'saldo', 'saldo atual', 'valor', 'montante'];
const LOJA_KEYS = ['loja', 'cod loja', 'cod. loja', 'codigo loja', 'loja cliente'];

function hasAnyKey(normalizedRow, keys) {
  return normalizedRow.some((c) => keys.includes(c));
}

// Some exports concatenate "código-loja-nome" into a single cell (e.g. "000135-01-ACQUALUR
// SERVICOS E"). Splits out the leading code and, when present, the loja (branch/store) segment
// that follows it — some clients register one conta contábil per loja of the same código, so the
// loja can matter for resolving the correct account (see resolveClientAccount in
// clientReconciliation.js).
function extractCodeAndLoja(raw) {
  const str = String(raw ?? '').trim();
  const match = str.match(/^(.*?)\s*-\s*(\d+)/);
  if (!match) return { code: str, loja: '' };
  return { code: match[1].trim(), loja: match[2].trim() };
}

function findHeaderRow(rows, requiredKeySets) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i] || [];
    const normalized = row.map((c) => normalizeKey(c));
    if (requiredKeySets.every((keys) => hasAnyKey(normalized, keys))) {
      return i;
    }
  }
  return -1;
}

function buildColumnMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, idx) => {
    const key = normalizeKey(cell);
    if (CODE_KEYS.includes(key) && map.code === undefined) map.code = idx;
    else if (ACCOUNT_KEYS.includes(key) && map.account === undefined) map.account = idx;
    else if (NAME_KEYS.includes(key) && map.name === undefined) map.name = idx;
    else if (VALUE_KEYS.includes(key) && map.value === undefined) map.value = idx;
    else if (LOJA_KEYS.includes(key) && map.loja === undefined) map.loja = idx;
  });
  return map;
}

// Some "Clientes" exports bundle several sheets sharing the exact same header (e.g. a duplicate
// draft sheet, or a copy renamed by the accountant while preparing the reconciliation) alongside
// helper sheets with pre-computed pivots. When several sheets match the required columns, a
// preferred sheet name — matched case/accent-insensitively — breaks the tie: an exact name match
// wins over a substring match, which wins over the first sheet found (the prior, order-only
// behavior, preserved for callers that don't pass a preference).
function scoreSheetName(sheetName, preferredKeyword) {
  if (!preferredKeyword) return 0;
  const normalized = normalizeKey(sheetName);
  if (normalized === preferredKeyword) return 2;
  if (normalized.includes(preferredKeyword)) return 1;
  return 0;
}

function findDataSheet(workbook, requiredKeySets, preferredKeyword) {
  let best = null;
  let bestScore = -1;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    const headerIdx = findHeaderRow(rows, requiredKeySets);
    if (headerIdx === -1) continue;

    const score = scoreSheetName(sheetName, preferredKeyword);
    if (score > bestScore) {
      bestScore = score;
      best = { rows, headerIdx };
    }
  }
  return best;
}

/**
 * Parses the "Cadastro de Clientes" spreadsheet into a code -> account lookup table.
 * Returns: [{ code, loja, account, name }]
 */
export function parseClientRegistry(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  const dataSheet = findDataSheet(workbook, [CODE_KEYS, ACCOUNT_KEYS]);
  if (!dataSheet) {
    throw new Error(
      'Não foi possível identificar as colunas de Código do Cliente e Conta Contábil na planilha de cadastro de clientes.'
    );
  }
  const { rows, headerIdx } = dataSheet;
  const columnMap = buildColumnMap(rows[headerIdx]);

  const entries = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === '' || c === null || c === undefined)) continue;

    const { code: extractedCode, loja: extractedLoja } = extractCodeAndLoja(row[columnMap.code]);
    const account = columnMap.account !== undefined ? String(row[columnMap.account] ?? '').trim() : '';
    if (!extractedCode || !account) continue;

    const loja = columnMap.loja !== undefined ? String(row[columnMap.loja] ?? '').trim() : extractedLoja;
    const name = columnMap.name !== undefined ? String(row[columnMap.name] ?? '').trim() : '';

    entries.push({ code: extractedCode, loja, account, name });
  }

  return entries;
}

/**
 * Parses the "Clientes" (accounts-receivable totals) spreadsheet, identified by client code, not
 * name. Uses the "TOTAL" column, which already carries the correct sign (positive for open
 * invoices, negative for credit notes that reduce the client's balance) — unlike the accounts
 * payable totals used for suppliers, it must NOT be normalized to an absolute value.
 * Returns: [{ code, loja, name, value }]
 */
export function parseClientTotals(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  const dataSheet = findDataSheet(workbook, [CODE_KEYS, VALUE_KEYS], 'posicao dos titulos');
  if (!dataSheet) {
    throw new Error(
      'Não foi possível identificar as colunas de Código do Cliente e Total na planilha de clientes.'
    );
  }
  const { rows, headerIdx } = dataSheet;
  const columnMap = buildColumnMap(rows[headerIdx]);

  const entries = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === '' || c === null || c === undefined)) continue;

    const { code, loja: extractedLoja } = extractCodeAndLoja(row[columnMap.code]);
    if (!code) continue;

    const value = parseAmount(row[columnMap.value]);
    if (value === null || Number.isNaN(value)) continue;

    const loja = columnMap.loja !== undefined ? String(row[columnMap.loja] ?? '').trim() : extractedLoja;
    const name = columnMap.name !== undefined ? String(row[columnMap.name] ?? '').trim() : '';

    entries.push({ code, loja, name, value: Math.round(value * 100) / 100 });
  }

  return entries;
}
