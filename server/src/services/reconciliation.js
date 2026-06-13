const DATE_TOLERANCE_DAYS = 3;
const AMOUNT_TOLERANCE = 0.01;

function dateDiffInDays(a, b) {
  if (!a || !b) return Infinity;
  const dA = new Date(a);
  const dB = new Date(b);
  if (Number.isNaN(dA.getTime()) || Number.isNaN(dB.getTime())) return Infinity;
  return Math.abs((dA - dB) / 86400000);
}

/**
 * Reconciles ledger ("razão contábil") entries against bank statement entries.
 * Matches are made by value (exact, within a small tolerance) and date proximity.
 */
export function reconcileBank(ledgerEntries, bankEntries) {
  const ledger = ledgerEntries.map((e, idx) => ({ ...e, _idx: idx, _matched: false }));
  const bank = bankEntries.map((e, idx) => ({ ...e, _idx: idx, _matched: false }));

  const matched = [];

  for (const ledgerItem of ledger) {
    let bestMatch = null;
    let bestScore = Infinity;

    for (const bankItem of bank) {
      if (bankItem._matched) continue;
      if (Math.abs(ledgerItem.value - bankItem.value) > AMOUNT_TOLERANCE) continue;

      const diffDays = dateDiffInDays(ledgerItem.date, bankItem.date);
      if (diffDays > DATE_TOLERANCE_DAYS) continue;

      if (diffDays < bestScore) {
        bestScore = diffDays;
        bestMatch = bankItem;
      }
    }

    if (bestMatch) {
      ledgerItem._matched = true;
      bestMatch._matched = true;
      matched.push({
        title: ledgerItem.title,
        date: ledgerItem.date,
        bankDate: bestMatch.date,
        value: ledgerItem.value,
        status: 'Conciliado',
        ledgerDescription: ledgerItem.description,
        bankDescription: bestMatch.description,
      });
    }
  }

  const onlyLedger = ledger
    .filter((e) => !e._matched)
    .map((e) => ({
      title: e.title,
      date: e.date,
      value: e.value,
      status: 'Não localizado no extrato bancário',
      ledgerDescription: e.description,
      bankDescription: '',
    }));

  const onlyBank = bank
    .filter((e) => !e._matched)
    .map((e) => ({
      title: e.title,
      date: e.date,
      value: e.value,
      status: 'Não localizado na contabilidade',
      ledgerDescription: '',
      bankDescription: e.description,
    }));

  const differences = [...onlyLedger, ...onlyBank].sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
    return Math.abs(b.value) - Math.abs(a.value);
  });

  const sum = (arr) => arr.reduce((acc, e) => acc + e.value, 0);

  const summary = {
    totalLedger: ledger.length,
    totalBank: bank.length,
    totalMatched: matched.length,
    totalOnlyLedger: onlyLedger.length,
    totalOnlyBank: onlyBank.length,
    sumLedger: Math.round(sum(ledger) * 100) / 100,
    sumBank: Math.round(sum(bank) * 100) / 100,
    sumOnlyLedger: Math.round(sum(onlyLedger) * 100) / 100,
    sumOnlyBank: Math.round(sum(onlyBank) * 100) / 100,
  };
  summary.difference = Math.round((summary.sumLedger - summary.sumBank) * 100) / 100;

  return { summary, matched, differences };
}
