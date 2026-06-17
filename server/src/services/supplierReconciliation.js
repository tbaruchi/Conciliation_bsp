import { normalizeAccountCode } from '../utils/normalize.js';

const AMOUNT_TOLERANCE = 0.01;

// Only accounts under this classification group (Fornecedores a Pagar) are considered
// from the balancete contábil; every other account is ignored.
const SUPPLIER_GROUP_PREFIX = ['2', '1', '2'];

function round(value) {
  return Math.round(value * 100) / 100;
}

// Splits an account code into its hierarchical segments (e.g. "2.1.2.01.0001" -> ["2","1","2","01","0001"]),
// normalizing each segment by stripping leading zeros so "02" and "2" are treated the same.
function getAccountSegments(code) {
  return String(code ?? '')
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.replace(/^0+(?=.)/, '').toUpperCase());
}

// Checks whether an account belongs to the supplier group (starts with 2.1.2),
// respecting the hierarchical structure of the code (so 2.1.20.x does not match 2.1.2.x).
function isInSupplierGroup(account) {
  const segments = getAccountSegments(account);
  if (segments.length >= SUPPLIER_GROUP_PREFIX.length) {
    return SUPPLIER_GROUP_PREFIX.every((seg, i) => segments[i] === seg);
  }
  // Fallback for flat (non-hierarchical/non-separated) account codes.
  return segments.join('').startsWith(SUPPLIER_GROUP_PREFIX.join(''));
}

// Aggregates entries by normalized account code, summing values for accounts
// that appear more than once in the same spreadsheet.
function aggregateByAccount(entries) {
  const map = new Map();
  for (const entry of entries) {
    const key = normalizeAccountCode(entry.account);
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.value = round(existing.value + entry.value);
      if (!existing.name && entry.name) existing.name = entry.name;
    } else {
      map.set(key, { account: entry.account, name: entry.name, value: entry.value });
    }
  }
  return map;
}

/**
 * Reconciles "balancete contábil" account balances against the suppliers ("fornecedores")
 * spreadsheet totals, matching by conta contábil.
 */
export function reconcileSuppliers(balanceteEntries, supplierEntries) {
  const balancete = aggregateByAccount(balanceteEntries.filter((e) => isInSupplierGroup(e.account)));
  const suppliers = aggregateByAccount(supplierEntries);

  const matched = [];
  const differences = [];

  const allKeys = new Set([...balancete.keys(), ...suppliers.keys()]);

  for (const key of allKeys) {
    const b = balancete.get(key);
    const s = suppliers.get(key);

    if (b && s) {
      const difference = round(b.value - s.value);
      const entry = {
        supplier: s.name || b.name || s.account || b.account,
        account: s.account || b.account,
        balanceteValue: b.value,
        supplierValue: s.value,
        difference,
      };
      if (Math.abs(difference) <= AMOUNT_TOLERANCE) {
        matched.push({ ...entry, status: 'Conciliado' });
      } else {
        differences.push({ ...entry, status: 'Diferença de valor' });
      }
    } else if (b && !s) {
      differences.push({
        supplier: b.name || b.account,
        account: b.account,
        balanceteValue: b.value,
        supplierValue: 0,
        difference: b.value,
        status: 'Não localizado na planilha de fornecedores',
      });
    } else if (s && !b) {
      differences.push({
        supplier: s.name || s.account,
        account: s.account,
        balanceteValue: 0,
        supplierValue: s.value,
        difference: round(-s.value),
        status: 'Não localizado no balancete contábil',
      });
    }
  }

  differences.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

  const sumValues = (map) => [...map.values()].reduce((acc, e) => acc + e.value, 0);

  const summary = {
    totalBalancete: balancete.size,
    totalSuppliers: suppliers.size,
    totalMatched: matched.length,
    totalDifferences: differences.length,
    sumBalancete: round(sumValues(balancete)),
    sumSuppliers: round(sumValues(suppliers)),
  };
  summary.difference = round(summary.sumBalancete - summary.sumSuppliers);

  return { summary, matched, differences };
}
