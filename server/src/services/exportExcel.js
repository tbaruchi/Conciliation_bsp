import * as XLSX from 'xlsx';

/**
 * Builds an .xlsx workbook (as a Buffer) from a bank reconciliation result.
 */
export function buildBankReconciliationWorkbook(result) {
  const { summary, differences, matched } = result;

  const workbook = XLSX.utils.book_new();

  const diffRows = differences.map((d) => ({
    Título: d.title,
    Data: d.date || '',
    Valor: d.value,
    Status: d.status,
    'Histórico Razão': d.ledgerDescription,
    'Histórico Extrato': d.bankDescription,
  }));
  const diffSheet = XLSX.utils.json_to_sheet(diffRows);
  XLSX.utils.book_append_sheet(workbook, diffSheet, 'Diferenças');

  const matchedRows = matched.map((m) => ({
    Título: m.title,
    'Data Razão': m.date || '',
    'Data Extrato': m.bankDate || '',
    Valor: m.value,
    Status: m.status,
    'Histórico Razão': m.ledgerDescription,
    'Histórico Extrato': m.bankDescription,
  }));
  const matchedSheet = XLSX.utils.json_to_sheet(matchedRows);
  XLSX.utils.book_append_sheet(workbook, matchedSheet, 'Conciliados');

  const summaryRows = [
    { Indicador: 'Lançamentos no razão contábil', Valor: summary.totalLedger },
    { Indicador: 'Lançamentos no extrato bancário', Valor: summary.totalBank },
    { Indicador: 'Itens conciliados', Valor: summary.totalMatched },
    { Indicador: 'Apenas no razão contábil', Valor: summary.totalOnlyLedger },
    { Indicador: 'Apenas no extrato bancário', Valor: summary.totalOnlyBank },
    { Indicador: 'Soma razão contábil (R$)', Valor: summary.sumLedger },
    { Indicador: 'Soma extrato bancário (R$)', Valor: summary.sumBank },
    { Indicador: 'Soma diferenças - apenas razão (R$)', Valor: summary.sumOnlyLedger },
    { Indicador: 'Soma diferenças - apenas extrato (R$)', Valor: summary.sumOnlyBank },
    { Indicador: 'Diferença total (Razão - Extrato) (R$)', Valor: summary.difference },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
