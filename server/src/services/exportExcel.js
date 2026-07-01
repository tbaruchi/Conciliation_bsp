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

/**
 * Builds an .xlsx workbook (as a Buffer) from a supplier reconciliation result.
 */
export function buildSupplierReconciliationWorkbook(result) {
  const { summary, differences, matched } = result;

  const workbook = XLSX.utils.book_new();

  const diffRows = differences.map((d) => ({
    Fornecedor: d.supplier,
    'Conta Contábil': d.account,
    'Saldo Balancete': d.balanceteValue,
    'Total Fornecedor': d.supplierValue,
    Diferença: d.difference,
    Status: d.status,
  }));
  const diffSheet = XLSX.utils.json_to_sheet(diffRows);
  XLSX.utils.book_append_sheet(workbook, diffSheet, 'Diferenças');

  const matchedRows = matched.map((m) => ({
    Fornecedor: m.supplier,
    'Conta Contábil': m.account,
    'Saldo Balancete': m.balanceteValue,
    'Total Fornecedor': m.supplierValue,
    Diferença: m.difference,
    Status: m.status,
  }));
  const matchedSheet = XLSX.utils.json_to_sheet(matchedRows);
  XLSX.utils.book_append_sheet(workbook, matchedSheet, 'Conciliados');

  const summaryRows = [
    { Indicador: 'Contas no balancete contábil', Valor: summary.totalBalancete },
    { Indicador: 'Fornecedores na planilha', Valor: summary.totalSuppliers },
    { Indicador: 'Itens conciliados', Valor: summary.totalMatched },
    { Indicador: 'Itens com diferença', Valor: summary.totalDifferences },
    { Indicador: 'Soma balancete contábil (R$)', Valor: summary.sumBalancete },
    { Indicador: 'Soma planilha de fornecedores (R$)', Valor: summary.sumSuppliers },
    { Indicador: 'Diferença total (Balancete - Fornecedores) (R$)', Valor: summary.difference },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Builds an .xlsx workbook (as a Buffer) from a client reconciliation result.
 */
export function buildClientReconciliationWorkbook(result) {
  const { summary, differences, matched } = result;

  const workbook = XLSX.utils.book_new();

  const diffRows = differences.map((d) => ({
    Cliente: d.client,
    'Conta Contábil': d.account,
    'Saldo Balancete': d.balanceteValue,
    'Total Cliente': d.clientValue,
    Diferença: d.difference,
    Status: d.status,
  }));
  const diffSheet = XLSX.utils.json_to_sheet(diffRows);
  XLSX.utils.book_append_sheet(workbook, diffSheet, 'Diferenças');

  const matchedRows = matched.map((m) => ({
    Cliente: m.client,
    'Conta Contábil': m.account,
    'Saldo Balancete': m.balanceteValue,
    'Total Cliente': m.clientValue,
    Diferença: m.difference,
    Status: m.status,
  }));
  const matchedSheet = XLSX.utils.json_to_sheet(matchedRows);
  XLSX.utils.book_append_sheet(workbook, matchedSheet, 'Conciliados');

  const summaryRows = [
    { Indicador: 'Contas no balancete contábil (nacionais)', Valor: summary.totalBalancete },
    { Indicador: 'Clientes na planilha', Valor: summary.totalClients },
    { Indicador: 'Clientes internacionais descartados', Valor: summary.totalDiscardedInternational },
    { Indicador: 'Itens conciliados', Valor: summary.totalMatched },
    { Indicador: 'Itens com diferença', Valor: summary.totalDifferences },
    { Indicador: 'Soma balancete contábil (R$)', Valor: summary.sumBalancete },
    { Indicador: 'Soma planilha de clientes (R$)', Valor: summary.sumClients },
    { Indicador: 'Diferença total (Balancete - Clientes) (R$)', Valor: summary.difference },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
