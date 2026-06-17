import * as XLSX from 'xlsx';
import { normalizeKey, parseAmount } from '../utils/normalize.js';

const CODE_KEYS = [
  'codigo',
  'cod',
  'codigo fornecedor',
  'cod fornecedor',
  'codigo do fornecedor',
  'cod. fornecedor',
  'cod forn',
  'fornecedor',
  'cliente',
  'cod cliente',
  'codigo cliente',
  'matricula',
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
  'nome fornecedor',
  'nome do fornecedor',
  'razao social',
  'nome',
  'nome abreviado',
  'descricao',
  'fornecedor',
];
const VALUE_KEYS = ['total', 'valor total', 'saldo', 'saldo atual', 'valor', 'montante'];

function hasAnyKey(normalizedRow, keys) {
  return normalizedRow.some((c) => keys.includes(c));
}

// Some exports concatenate "código -loja" (or "código -loja-nome") into a single cell even
// under a plain "Codigo" header (e.g. "92028 -01"). Keep only the leading code segment so it
// matches the bare code used elsewhere (e.g. in the supplier registry).
function extractLeadingCode(raw) {
  const str = String(raw ?? '').trim();
  const match = str.match(/^(.*?)\s+-/);
  return (match ? match[1] : str).trim();
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
  });
  return map;
}

function findDataSheet(workbook, requiredKeySets) {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    const headerIdx = findHeaderRow(rows, requiredKeySets);
    if (headerIdx !== -1) {
      return { rows, headerIdx };
    }
  }
  return null;
}

/**
 * Parses the "Cadastro de Fornecedores" spreadsheet into a code -> account lookup table.
 * Returns: [{ code, account, name }]
 */
export function parseSupplierRegistry(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  const dataSheet = findDataSheet(workbook, [CODE_KEYS, ACCOUNT_KEYS]);
  if (!dataSheet) {
    throw new Error(
      'Não foi possível identificar as colunas de Código do Fornecedor e Conta Contábil na planilha de cadastro de fornecedores.'
    );
  }
  const { rows, headerIdx } = dataSheet;
  const columnMap = buildColumnMap(rows[headerIdx]);

  const entries = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === '' || c === null || c === undefined)) continue;

    const code = extractLeadingCode(row[columnMap.code]);
    const account = columnMap.account !== undefined ? String(row[columnMap.account] ?? '').trim() : '';
    if (!code || !account) continue;

    const name = columnMap.name !== undefined ? String(row[columnMap.name] ?? '').trim() : '';

    entries.push({ code, account, name });
  }

  return entries;
}

/**
 * Parses the "Planilha de Fornecedores" (totals) spreadsheet, identified by supplier code, not name.
 * Returns: [{ code, name, value }]
 */
export function parseSupplierTotals(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  const dataSheet = findDataSheet(workbook, [CODE_KEYS, VALUE_KEYS]);
  if (!dataSheet) {
    throw new Error(
      'Não foi possível identificar as colunas de Código do Fornecedor e Total na planilha de fornecedores.'
    );
  }
  const { rows, headerIdx } = dataSheet;
  const columnMap = buildColumnMap(rows[headerIdx]);

  const entries = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === '' || c === null || c === undefined)) continue;

    const code = extractLeadingCode(row[columnMap.code]);
    if (!code) continue;

    const value = parseAmount(row[columnMap.value]);
    if (value === null || Number.isNaN(value)) continue;

    const name = columnMap.name !== undefined ? String(row[columnMap.name] ?? '').trim() : '';

    // Accounts-payable exports commonly list outstanding amounts as negative (cash-flow
    // convention), while the balancete shows the same liability as a positive balance. Only
    // the magnitude is meaningful for reconciliation, so it's normalized to a positive value.
    entries.push({ code, name, value: Math.round(Math.abs(value) * 100) / 100 });
  }

  return entries;
}
