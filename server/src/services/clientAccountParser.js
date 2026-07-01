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
  'cliente',
  'nome cliente',
  'nome do cliente',
  'razao social',
  'nome',
  'descricao',
  'nome da conta',
  'titulo da conta',
  'historico',
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

const DEFAULT_HIGHLIGHT_COLOR = 'FFFF00';

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
      return { sheet, rows, headerIdx };
    }
  }
  return null;
}

/**
 * Parses a "Balancete de Verificação" .xlsx/.xls buffer restricted to Contas a Receber
 * (clientes), returning a normalized list of entries. Unlike accounts payable (suppliers),
 * accounts receivable is a debit-normal group: a "D" (débito) balance is the normal, positive
 * direction, while a "C" (crédito) balance — e.g. a client with a credit note or overpayment —
 * offsets the receivable and must be treated as negative. This is the opposite sign convention
 * from parseAccountBalances, which handles the credit-normal supplier group.
 *
 * Clients differ from suppliers in one more way: their chart-of-accounts hierarchy has no single
 * fixed group prefix across TOTVS Protheus clients. Instead, national clients are consistently
 * highlighted with a fill color in the balancete (yellow, by default) — that highlight is used
 * here to flag each leaf entry with `national: true/false`, so the reconciliation can restrict
 * itself to national clients and discard international ones, per client instruction.
 *
 * Returns: [{ account, name, value, national }]
 */
export function parseClientAccountBalances(buffer, { highlightColor = DEFAULT_HIGHLIGHT_COLOR } = {}) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, cellStyles: true });

  const dataSheet = findDataSheet(workbook);
  if (!dataSheet) {
    throw new Error('Não foi possível identificar as colunas de Conta e Total/Saldo na planilha.');
  }
  const { sheet, rows, headerIdx } = dataSheet;

  const columnMap = buildColumnMap(rows[headerIdx]);
  const entries = [];
  const targetColor = highlightColor.toUpperCase();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === '' || c === null || c === undefined)) continue;

    const account = String(row[columnMap.account] ?? '').trim();
    if (!account) continue;

    let value = parseAmount(row[columnMap.value]);
    if (value === null || Number.isNaN(value)) continue;

    const signMarker = String(row[columnMap.value + 1] ?? '').trim().toUpperCase();
    if (signMarker === 'D') value = Math.abs(value);
    else if (signMarker === 'C') value = -Math.abs(value);

    const name = columnMap.name !== undefined ? String(row[columnMap.name] ?? '').trim() : '';

    const cellAddr = XLSX.utils.encode_cell({ r: i, c: columnMap.account });
    const cell = sheet[cellAddr];
    const fgColor = cell?.s?.fgColor?.rgb;
    const national = String(fgColor ?? '').toUpperCase() === targetColor;

    entries.push({
      account,
      name,
      value: Math.round(value * 100) / 100,
      national,
    });
  }

  return entries;
}
