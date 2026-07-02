import { normalizeAccountCode, normalizeKey } from '../utils/normalize.js';

const AMOUNT_TOLERANCE = 0.01;

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

// Same split as getAccountSegments but keeps each segment's original digits (no leading-zero
// stripping), needed to detect parent/child accounts whose deepest segment isn't separated by
// a further dot but instead extends the parent's zero-padded code directly — e.g. some TOTVS
// Protheus exports use a "conta reduzida" scheme where the subtotal "0010" is itself the
// leading digits of every individual supplier's full code "001000000801". That only lines up
// when comparing the original, unstripped digits.
function getRawAccountSegments(code) {
  return String(code ?? '')
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.toUpperCase());
}

// A subtotal description that names the group as suppliers (the standard TOTVS Protheus wording,
// e.g. "FORNECEDORES", "FORNECEDORES NACIONAIS", "FORNECEDORES ESTRANGEIROS"). Different clients
// place this group under a different account prefix (seen at "2.1.2" for one client and "2.1.3"
// for another) — matching by description instead of a hardcoded prefix generalizes across them.
//
// A bare "FORNECEDORES" with no nationality qualifier is treated as national — some clients'
// chart of accounts doesn't separate foreign suppliers into their own branch at all, and in that
// case there's nothing to exclude.
function descriptionSupplierGroupHint(name) {
  const text = normalizeKey(name);
  if (!text.includes('fornecedor')) return null;
  if (/estrangeir|exterior|internacion/.test(text)) return { inGroup: true, national: false };
  return { inGroup: true, national: true };
}

// Classifies every balancete entry as belonging to the supplier group or not — and, when it does,
// whether it's specifically the national or foreign/estrangeiro sub-branch — by walking each
// entry's ancestor chain (by account hierarchy) for the nearest subtotal whose description names
// it as a fornecedores group. Only subtotal rows (accounts that are themselves an ancestor of
// some other account) are eligible to contribute a hint — a leaf's own description is the
// individual supplier's name, which can coincidentally contain "fornecedor" (e.g. "ADTO A
// FORNECEDORES NACIONAIS", an unrelated advances-to-suppliers asset account) without being part
// of the accounts-payable group itself.
//
// A hint is also only trusted from the liability side of the chart of accounts (the top-level
// segment used for Passivo, "2" in every TOTVS Protheus client seen so far). "Fornecedores a
// Pagar" — what's owed to suppliers — is a liability; "Adiantamentos a Fornecedores" — advances
// already paid to suppliers — is an asset with its own subtotal/children and literally contains
// "fornecedores" in its description too, so without this guard it would be wrongly folded in.
function classifySupplierGroup(entries) {
  const segmentsList = entries.map((e) => getAccountSegments(e.account));
  const isSubtotal = entries.map((_, j) => {
    const aSegments = segmentsList[j];
    return segmentsList.some(
      (bSegments, i) => i !== j && bSegments.length > aSegments.length && aSegments.every((seg, k) => seg === bSegments[k])
    );
  });
  const hints = entries.map((e, i) =>
    isSubtotal[i] && segmentsList[i][0] === '2' ? descriptionSupplierGroupHint(e.name) : null
  );

  return entries.map((entry, i) => {
    if (hints[i]) return hints[i];

    const bSegments = segmentsList[i];
    let bestDepth = -1;
    let bestHint = null;
    for (let j = 0; j < entries.length; j++) {
      if (j === i || !hints[j]) continue;
      const aSegments = segmentsList[j];
      if (aSegments.length >= bSegments.length) continue;
      if (!aSegments.every((seg, k) => seg === bSegments[k])) continue;
      if (aSegments.length > bestDepth) {
        bestDepth = aSegments.length;
        bestHint = hints[j];
      }
    }
    return bestHint || { inGroup: false, national: false };
  });
}

function isAncestorOf(aSegments, bSegments, aRaw, bRaw) {
  if (bSegments.length < aSegments.length) return false;
  for (let i = 0; i < aSegments.length - 1; i++) {
    if (aSegments[i] !== bSegments[i]) return false;
  }
  const lastIdx = aSegments.length - 1;
  if (bSegments.length > aSegments.length) {
    return aSegments[lastIdx] === bSegments[lastIdx];
  }
  // Same depth: the child's last segment may extend the parent's via zero-padding
  // (e.g. parent "0010", child "001000000801") rather than via an extra dot level.
  return aRaw[lastIdx] !== bRaw[lastIdx] && bRaw[lastIdx].startsWith(aRaw[lastIdx]);
}

// Balancetes list the supplier group as a hierarchy with subtotal rows at every level
// (e.g. "2.1.2", "2.1.2.01", "2.1.2.01.01") followed by the individual supplier accounts
// (e.g. "2.1.2.01.01.012", or "2.1.2.01.001000000801" in flat-suffix-extension schemes).
// Only the leaf accounts represent real suppliers and should be matched; subtotal/title rows
// at any level are excluded to avoid counting balances multiple times.
function filterLeafAccounts(entries) {
  const segmentsList = entries.map((e) => getAccountSegments(e.account));
  const rawList = entries.map((e) => getRawAccountSegments(e.account));
  return entries.filter(
    (_, i) =>
      !segmentsList.some(
        (other, j) => j !== i && isAncestorOf(segmentsList[i], other, rawList[i], rawList[j])
      )
  );
}

// Aggregates entries by a derived key, summing values for entries that share the same key.
function aggregateByKey(entries, getKey) {
  const map = new Map();
  for (const entry of entries) {
    const key = getKey(entry);
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.value = round(existing.value + entry.value);
      if (!existing.name && entry.name) existing.name = entry.name;
    } else {
      map.set(key, { ...entry });
    }
  }
  return map;
}

// Groups registry entries by supplier código, tracking the account registered for each loja
// (branch/store). Most ERPs register a single account per supplier regardless of loja, but
// some (seen in real TOTVS Protheus exports) register one distinct conta contábil per loja of
// the same código — in that case the loja must be used to pick the right account.
function buildRegistryIndex(entries) {
  const byCode = new Map();
  for (const entry of entries) {
    const code = normalizeAccountCode(entry.code);
    if (!code || !entry.account) continue;
    let group = byCode.get(code);
    if (!group) {
      group = { byLoja: new Map(), accounts: new Set(), name: '' };
      byCode.set(code, group);
    }
    const loja = normalizeAccountCode(entry.loja || '');
    if (loja && !group.byLoja.has(loja)) group.byLoja.set(loja, entry.account);
    group.accounts.add(entry.account);
    if (!group.name && entry.name) group.name = entry.name;
  }
  return byCode;
}

// Resolves the conta contábil for a supplier total entry. When every loja of that código
// shares the same account, the loja is irrelevant and that account is used directly. Otherwise
// the loja is required to disambiguate between the supplier's per-loja accounts.
function resolveSupplierAccount(group, loja) {
  if (!group) return null;
  if (group.accounts.size === 1) return [...group.accounts][0];
  if (loja && group.byLoja.has(loja)) return group.byLoja.get(loja);
  return null;
}

/**
 * Reconciles "balancete contábil" account balances against the suppliers ("fornecedores")
 * spreadsheet totals, restricted to national suppliers — foreign/estrangeiro suppliers are
 * discarded from the result entirely, mirroring the client reconciliation (their AP aging report
 * commonly has no titles at all for foreign suppliers, since those are settled outside the local
 * duplicata/título flow this report tracks). Since the totals spreadsheet identifies suppliers by
 * code (not by account or by name — names may diverge between spreadsheets), each supplier code
 * is first resolved to its conta contábil via a VLOOKUP-style lookup against the supplier
 * registry ("Cadastro de Fornecedores"), and only then matched against the balancete by account.
 */
export function reconcileSuppliers(balanceteEntries, supplierTotalEntries, supplierRegistryEntries) {
  const classified = classifySupplierGroup(balanceteEntries);
  const combined = balanceteEntries.map((entry, i) => ({ ...entry, ...classified[i] }));
  const leafEntries = filterLeafAccounts(combined.filter((e) => e.inGroup));

  const balancete = aggregateByKey(
    leafEntries.filter((e) => e.national),
    (e) => normalizeAccountCode(e.account)
  );
  const otherLeafAccounts = new Set(
    leafEntries.filter((e) => !e.national).map((e) => normalizeAccountCode(e.account))
  );

  const registryIndex = buildRegistryIndex(supplierRegistryEntries);
  const totalsByCode = aggregateByKey(supplierTotalEntries, (e) => normalizeAccountCode(e.code));
  const totalsByCodeLoja = aggregateByKey(
    supplierTotalEntries,
    (e) => `${normalizeAccountCode(e.code)}|${normalizeAccountCode(e.loja || '')}`
  );

  const resolved = [];
  const unresolved = [];
  let discardedForeign = 0;
  for (const entry of totalsByCodeLoja.values()) {
    const group = registryIndex.get(normalizeAccountCode(entry.code));
    const account = resolveSupplierAccount(group, normalizeAccountCode(entry.loja || ''));
    if (!account) {
      unresolved.push(entry);
      continue;
    }
    // The account is known to the balancete but explicitly outside the national-supplier
    // branch — a foreign supplier, discarded entirely rather than reported as a difference.
    if (otherLeafAccounts.has(normalizeAccountCode(account))) {
      discardedForeign++;
      continue;
    }
    resolved.push({ account, name: entry.name || group.name, value: entry.value });
  }

  const suppliers = aggregateByKey(resolved, (e) => normalizeAccountCode(e.account));

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

  for (const entry of unresolved) {
    differences.push({
      supplier: entry.name || entry.code,
      account: '',
      balanceteValue: 0,
      supplierValue: entry.value,
      difference: round(-entry.value),
      status: 'Fornecedor não localizado no cadastro (sem conta contábil)',
    });
  }

  differences.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

  const sumValues = (map) => [...map.values()].reduce((acc, e) => acc + e.value, 0);

  const summary = {
    totalBalancete: balancete.size,
    totalSuppliers: totalsByCode.size,
    totalRegistry: registryIndex.size,
    totalUnresolved: unresolved.length,
    totalDiscardedForeign: discardedForeign,
    totalMatched: matched.length,
    totalDifferences: differences.length,
    sumBalancete: round(sumValues(balancete)),
    sumSuppliers: round(sumValues(totalsByCode)),
  };
  summary.difference = round(summary.sumBalancete - summary.sumSuppliers);

  return { summary, matched, differences };
}
