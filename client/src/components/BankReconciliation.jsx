import { useState } from 'react';
import FileUploadField from './FileUploadField';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatDate(value) {
  if (!value) return '-';
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

export default function BankReconciliation() {
  const [ledgerFile, setLedgerFile] = useState(null);
  const [statementFile, setStatementFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const canSubmit = ledgerFile && statementFile && !loading;

  async function handleReconcile() {
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('ledger', ledgerFile);
    formData.append('statement', statementFile);

    try {
      const res = await fetch('/api/bank/reconcile', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar a conciliação.');
      }
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    if (!result) return;
    setExporting(true);
    try {
      const res = await fetch('/api/bank/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      if (!res.ok) throw new Error('Erro ao gerar o arquivo Excel.');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'conciliacao_bancaria.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-xl font-semibold text-pkf-navy mb-1">Conciliação Bancária</h2>
        <p className="text-sm text-gray-500 mb-6">
          Envie o razão contábil e o extrato bancário para identificar as diferenças por título.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <FileUploadField
            label="Razão Contábil"
            hint="Excel (.xlsx, .xls)"
            accept=".xlsx,.xls"
            file={ledgerFile}
            onChange={setLedgerFile}
          />
          <FileUploadField
            label="Extrato Bancário"
            hint="Excel (.xlsx, .xls) ou PDF (.pdf)"
            accept=".xlsx,.xls,.pdf"
            file={statementFile}
            onChange={setStatementFile}
          />
        </div>

        <button
          onClick={handleReconcile}
          disabled={!canSubmit}
          className="bg-pkf-navy text-white font-medium px-6 py-3 rounded-lg hover:bg-pkf-navy-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? 'Processando...' : 'Iniciar Conciliação'}
        </button>

        {error && (
          <div className="mt-4 bg-pkf-red/10 border border-pkf-red/30 text-pkf-red text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SummaryCard label="Conciliados" value={result.summary.totalMatched} color="green" />
            <SummaryCard label="Apenas no Razão" value={result.summary.totalOnlyLedger} color="orange" />
            <SummaryCard label="Apenas no Extrato" value={result.summary.totalOnlyBank} color="magenta" />
            <SummaryCard
              label="Diferença Total"
              value={currency.format(result.summary.difference)}
              color="cyan"
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-pkf-navy">
                Diferenças por Título ({result.differences.length})
              </h3>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="bg-pkf-green text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
              >
                {exporting ? 'Gerando...' : '📥 Exportar para Excel'}
              </button>
            </div>

            {result.differences.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">
                Nenhuma diferença encontrada. Os registros estão totalmente conciliados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="py-2 pr-4">Título</th>
                      <th className="py-2 pr-4">Data</th>
                      <th className="py-2 pr-4 text-right">Valor</th>
                      <th className="py-2 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.differences.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 pr-4 max-w-xs truncate" title={item.title}>
                          {item.title}
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">{formatDate(item.date)}</td>
                        <td className="py-2 pr-4 text-right whitespace-nowrap">{currency.format(item.value)}</td>
                        <td className="py-2 pr-4">
                          <StatusBadge status={item.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const COLOR_MAP = {
  green: 'border-pkf-green/30 bg-pkf-green/10 text-pkf-green',
  orange: 'border-pkf-orange/30 bg-pkf-orange/10 text-pkf-orange',
  magenta: 'border-pkf-magenta/30 bg-pkf-magenta/10 text-pkf-magenta',
  cyan: 'border-pkf-cyan/30 bg-pkf-cyan/10 text-pkf-cyan',
};

function SummaryCard({ label, value, color }) {
  return (
    <div className={`rounded-xl border p-4 ${COLOR_MAP[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const isLedgerOnly = status.includes('extrato bancário');
  const color = isLedgerOnly ? COLOR_MAP.orange : COLOR_MAP.magenta;
  return <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full border ${color}`}>{status}</span>;
}
