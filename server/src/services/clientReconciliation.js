import { normalizeAccountCode } from '../utils/normalize.js';

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

// Groups registry entries by client código, tracking the account registered for each loja
// (branch/store) — some clients register one distinct conta contábil per loja of the same
// código, in which case the loja must be used to pick the right account.
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
 */
export function reconcileClients(balanceteEntries, clientTotalEntries, clientRegistryEntries) {
  const leafEntries = filterLeafAccounts(balanceteEntries);
  const nationalLeaf = leafEntries.filter((e) => e.national);
  const otherLeafAccounts = new Set(
    leafEntries.filter((e) => !e.national).map((e) => normalizeAccountCode(e.account))
  );

  const balancete = aggregateByKey(nationalLeaf, (e) => normalizeAccountCode(e.account));

  const registryIndex = buildRegistryIndex(clientRegistryEntries);
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
    const account = resolveClientAccount(group, normalizeAccountCode(entry.loja || ''));
    if (!account) {
      unresolved.push(entry);
      continue;
    }
    // The account is known to the balancete but explicitly outside the national-client
    // highlight — this is an international (or otherwise non-national) client, discarded
    // entirely rather than reported as a difference.
    if (otherLeafAccounts.has(normalizeAccountCode(account))) {
      discardedInternational++;
      continue;
    }
    resolved.push({ account, name: entry.name || group.name, value: entry.value });
  }

  const clients = aggregateByKey(resolved, (e) => normalizeAccountCode(e.account));

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
