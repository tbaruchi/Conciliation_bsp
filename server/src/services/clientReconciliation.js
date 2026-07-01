import { normalizeAccountCode, normalizeKey } from '../utils/normalize.js';

const AMOUNT_TOLERANCE = 0.01;

function round(value) {
  return Math.round(value * 100) / 100;
}

// Splits an account code into its hierarchical segments (e.g. "1.1.2.1.0001" -> ["1","1","2","1","0001"]),
// normalizing each segment by stripping leading zeros so "02" and "2" are treated the same.
function getAccountSegments(code) {
  return String(code ?? '')
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.replace(/^0+(?=.)/, '').toUpperCase());
}

// Same split as getAccountSegments but keeps each segment's original digits (no leading-zero
// stripping), needed to detect parent/child accounts whose deepest segment isn't separated by a
// further dot but instead extends the parent's zero-padded code directly (the "conta reduzida"
// scheme seen in some TOTVS Protheus exports — see clientReconciliation's supplier counterpart).
function getRawAccountSegments(code) {
  return String(code ?? '')
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.toUpperCase());
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
  return aRaw[lastIdx] !== bRaw[lastIdx] && bRaw[lastIdx].startsWith(aRaw[lastIdx]);
}

// Balancetes list every group (clientes nacionais, internacionais, and unrelated GL groups like
// ativo/passivo) as a hierarchy with subtotal rows at every level, followed by the individual
// leaf accounts. Only leaf accounts represent real ledger balances and should be matched;
// subtotal/title rows at any level are excluded to avoid counting balances multiple times. This
// runs across the whole balancete (not just the national-client subset) so that a client leaf
// account is never mistaken for a subtotal of some unrelated branch.
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

// A subtotal/leaf description that unambiguously names the group as national or international
// (the standard TOTVS Protheus wording, e.g. "CLIENTES NACIONAIS" / "CLIENTES INTERNACIONAIS").
// Requires "cliente" together with the nationality word — the same balancete usually also has a
// "FORNECEDORES NACIONAIS" group (accounts payable), and matching "nacion" alone would wrongly
// pull every supplier account into the client reconciliation. Returns true/false when the
// description is definitive, or null when it says nothing about client nationality (e.g. an
// individual client's own name, or an unrelated GL group like "ATIVO" or "FORNECEDORES").
function descriptionNationalityHint(name) {
  const text = normalizeKey(name);
  if (!text || !text.includes('cliente')) return null;
  if (/internacion|exterior/.test(text)) return false;
  if (/nacion/.test(text)) return true;
  return null;
}

// The balancete's fill-color highlight is the primary signal for national clients, but it isn't
// always preserved — a re-export or a resave through another tool can silently drop cell
// formatting while keeping every value intact. As a fallback, this walks each entry's ancestor
// chain (by account hierarchy) looking for the nearest subtotal whose description names the
// group as national/international, and uses that when the color signal is absent. The color
// signal still wins whenever it's present, since it's the more specific, per-client-validated
// convention.
//
// Only subtotal rows (accounts that are themselves an ancestor of some other account) are
// eligible to contribute a hint — a leaf's own description is the individual client's name, which
// can coincidentally contain the same words (e.g. "ADTOS CLIENTES NACIONAIS", an unrelated
// liability account for client advances) without being part of the receivables group at all.
function classifyNationality(entries) {
  const segmentsList = entries.map((e) => getAccountSegments(e.account));
  const isSubtotal = entries.map((_, j) => {
    const aSegments = segmentsList[j];
    return segmentsList.some(
      (bSegments, i) => i !== j && bSegments.length > aSegments.length && aSegments.every((seg, k) => seg === bSegments[k])
    );
  });
  const hints = entries.map((e, i) => (isSubtotal[i] ? descriptionNationalityHint(e.name) : null));

  return entries.map((entry, i) => {
    if (entry.national) return { ...entry, national: true };
    if (hints[i] === true) return { ...entry, national: true };
    if (hints[i] === false) return { ...entry, national: false };

    const bSegments = segmentsList[i];
    let bestDepth = -1;
    let bestHint = null;
    for (let j = 0; j < entries.length; j++) {
      if (j === i || hints[j] === null) continue;
      const aSegments = segmentsList[j];
      if (aSegments.length >= bSegments.length) continue;
      if (!aSegments.every((seg, k) => seg === bSegments[k])) continue;
      if (aSegments.length > bestDepth) {
        bestDepth = aSegments.length;
        bestHint = hints[j];
      }
    }
    return { ...entry, national: bestHint === true };
  });
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

// Same idea, but also collects every distinct conta contábil folded into that key — used once
// entries are grouped by CNPJ root, since a company merged from several códigos (or a balancete
// with more than one leaf account for the same CNPJ) can span more than one account. `account`
// is the joined, sorted list for display; `accounts` is the underlying set.
function aggregateWithAccounts(entries, getKey, getAccount) {
  const map = new Map();
  for (const entry of entries) {
    const key = getKey(entry);
    if (!key) continue;
    const account = getAccount(entry);
    const existing = map.get(key);
    if (existing) {
      existing.value = round(existing.value + entry.value);
      if (!existing.name && entry.name) existing.name = entry.name;
      if (account) existing.accounts.add(account);
    } else {
      map.set(key, { name: entry.name, value: entry.value, accounts: new Set(account ? [account] : []) });
    }
  }
  for (const group of map.values()) {
    group.account = [...group.accounts].sort().join(', ');
  }
  return map;
}

// Groups registry entries by client código, tracking the account registered for each loja
// (branch/store) — some clients register one distinct conta contábil per loja of the same
// código, in which case the loja must be used to pick the right account. Entries without an
// account (a registry gap) are still folded in for their CNPJ, so a duplicate código that never
// got a conta contábil assigned can still be merged into its company's totals below.
function buildRegistryIndex(entries) {
  const byCode = new Map();
  for (const entry of entries) {
    const code = normalizeAccountCode(entry.code);
    if (!code) continue;
    let group = byCode.get(code);
    if (!group) {
      group = { byLoja: new Map(), accounts: new Set(), name: '', cnpjRoot: '' };
      byCode.set(code, group);
    }
    if (entry.account) {
      const loja = normalizeAccountCode(entry.loja || '');
      if (loja && !group.byLoja.has(loja)) group.byLoja.set(loja, entry.account);
      group.accounts.add(entry.account);
    }
    if (!group.name && entry.name) group.name = entry.name;
    if (!group.cnpjRoot && entry.cnpjRoot) group.cnpjRoot = entry.cnpjRoot;
  }
  return byCode;
}

// Maps each known conta contábil to its company's CNPJ root, so a balancete leaf account can be
// folded into the same company-level group as every código that shares that CNPJ.
function buildAccountToCnpjRoot(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (!entry.account || !entry.cnpjRoot) continue;
    const account = normalizeAccountCode(entry.account);
    if (!map.has(account)) map.set(account, entry.cnpjRoot);
  }
  return map;
}

// Resolves the conta contábil for a client total entry. When every loja of that código shares
// the same account, the loja is irrelevant and that account is used directly. Otherwise the loja
// is required to disambiguate between the client's per-loja accounts.
function resolveClientAccount(group, loja) {
  if (!group) return null;
  if (group.accounts.size === 1) return [...group.accounts][0];
  if (loja && group.byLoja.has(loja)) return group.byLoja.get(loja);
  return null;
}

/**
 * Reconciles "balancete contábil" account balances against the clients ("clientes") accounts
 * receivable spreadsheet totals, restricted to national clients — international clients are
 * discarded from the result entirely, per client instruction. Since the totals spreadsheet
 * identifies clients by code (not by account or by name — names may diverge between
 * spreadsheets), each client code is first resolved to its conta contábil via a VLOOKUP-style
 * lookup against the client registry ("Cadastro de Clientes"), and only then matched against the
 * balancete by account.
 *
 * The same real company is often registered under several different códigos — one per
 * branch/CNPJ suffix, sometimes with a duplicate that never got a conta contábil assigned — which
 * would otherwise show up as separate, spuriously mismatched lines. Whenever a CNPJ root is known
 * (for either side), it takes over as the reconciliation key instead of the bare conta contábil,
 * folding every account and código that share it into one company-level total; the account is
 * used as the key only when no CNPJ is available for that entry.
 */
export function reconcileClients(balanceteEntries, clientTotalEntries, clientRegistryEntries) {
  const leafEntries = filterLeafAccounts(classifyNationality(balanceteEntries));
  const nationalLeaf = leafEntries.filter((e) => e.national);
  const otherLeafAccounts = new Set(
    leafEntries.filter((e) => !e.national).map((e) => normalizeAccountCode(e.account))
  );

  const registryIndex = buildRegistryIndex(clientRegistryEntries);
  const accountToCnpjRoot = buildAccountToCnpjRoot(clientRegistryEntries);

  const balancete = aggregateWithAccounts(
    nationalLeaf,
    (e) => accountToCnpjRoot.get(normalizeAccountCode(e.account)) || normalizeAccountCode(e.account),
    (e) => e.account
  );

  const totalsByCode = aggregateByKey(clientTotalEntries, (e) => normalizeAccountCode(e.code));
  const totalsByCodeLoja = aggregateByKey(
    clientTotalEntries,
    (e) => `${normalizeAccountCode(e.code)}|${normalizeAccountCode(e.loja || '')}`
  );

  const resolved = [];
  const unresolved = [];
  let discardedInternational = 0;
  for (const entry of totalsByCodeLoja.values()) {
    const group = registryIndex.get(normalizeAccountCode(entry.code));
    if (!group) {
      unresolved.push(entry);
      continue;
    }
    const account = resolveClientAccount(group, normalizeAccountCode(entry.loja || ''));
    // The account is known to the balancete but explicitly outside the national-client
    // highlight — this is an international (or otherwise non-national) client, discarded
    // entirely rather than reported as a difference.
    if (account && otherLeafAccounts.has(normalizeAccountCode(account))) {
      discardedInternational++;
      continue;
    }
    // Whenever a specific account is resolved, prefer the CNPJ root that account maps to on the
    // balancete side over this código's own registry CNPJ. A conta contábil is occasionally
    // reused by the client across a couple of unrelated códigos (their registry mistake, not
    // rare enough to ignore) — deferring to the account's mapping keeps both sides of the
    // reconciliation agreeing on the same group instead of splitting one balancete leaf in two.
    // The código's own CNPJ is only the fallback when no account was resolved at all (the
    // duplicate-registration gap this grouping exists to fix).
    const groupKey = account
      ? accountToCnpjRoot.get(normalizeAccountCode(account)) || normalizeAccountCode(account)
      : group.cnpjRoot;
    if (!groupKey) {
      unresolved.push(entry);
      continue;
    }
    resolved.push({ groupKey, account, name: entry.name || group.name, value: entry.value });
  }

  const clients = aggregateWithAccounts(resolved, (e) => e.groupKey, (e) => e.account);

  const matched = [];
  const differences = [];

  const allKeys = new Set([...balancete.keys(), ...clients.keys()]);

  for (const key of allKeys) {
    const b = balancete.get(key);
    const c = clients.get(key);

    if (b && c) {
      const difference = round(b.value - c.value);
      const entry = {
        client: c.name || b.name || c.account || b.account,
        account: c.account || b.account,
        balanceteValue: b.value,
        clientValue: c.value,
        difference,
      };
      if (Math.abs(difference) <= AMOUNT_TOLERANCE) {
        matched.push({ ...entry, status: 'Conciliado' });
      } else {
        differences.push({ ...entry, status: 'Diferença de valor' });
      }
    } else if (b && !c) {
      differences.push({
        client: b.name || b.account,
        account: b.account,
        balanceteValue: b.value,
        clientValue: 0,
        difference: b.value,
        status: 'Não localizado na planilha de clientes',
      });
    } else if (c && !b) {
      differences.push({
        client: c.name || c.account,
        account: c.account,
        balanceteValue: 0,
        clientValue: c.value,
        difference: round(-c.value),
        status: 'Não localizado no balancete contábil',
      });
    }
  }

  for (const entry of unresolved) {
    differences.push({
      client: entry.name || entry.code,
      account: '',
      balanceteValue: 0,
      clientValue: entry.value,
      difference: round(-entry.value),
      status: 'Cliente não localizado no cadastro (sem conta contábil)',
    });
  }

  differences.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

  const sumValues = (map) => [...map.values()].reduce((acc, e) => acc + e.value, 0);

  const summary = {
    totalBalancete: balancete.size,
    totalClients: totalsByCode.size,
    totalRegistry: registryIndex.size,
    totalUnresolved: unresolved.length,
    totalDiscardedInternational: discardedInternational,
    totalMatched: matched.length,
    totalDifferences: differences.length,
    sumBalancete: round(sumValues(balancete)),
    sumClients: round(sumValues(clients)),
  };
  summary.difference = round(summary.sumBalancete - summary.sumClients);

  return { summary, matched, differences };
}
