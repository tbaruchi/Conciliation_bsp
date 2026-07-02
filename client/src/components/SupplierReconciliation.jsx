import { useState } from 'react';
import FileUploadField from './FileUploadField';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// The reconciliation logic is fully generic (account group and nationality are both detected
// from the balancete's own descriptions), so this list exists purely so the combo box can show
// which clients have already been validated against real files.
const SUPPLIER_PROFILES = [
  { id: 'sh', label: 'SH do Brasil' },
  { id: 'emuge', label: 'EMUGE-FRANKEN' },
  { id: 'iwaki', label: 'IWAKI do Brasil' },
];

export default function SupplierReconciliation() {
  const [supplierProfile, setSupplierProfile] = useState(SUPPLIER_PROFILES[0].id);
  const [balanceteFile, setBalanceteFile] = useState(null);
  const [suppliersFile, setSuppliersFile] = useState(null);
  const [registryFile, setRegistryFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const canSubmit = balanceteFile && suppliersFile && registryFile && !loading;

  async function handleReconcile() {
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('supplierProfile', supplierProfile);
    formData.append('balancete', balanceteFile);
    formData.append('suppliers', suppliersFile);
    formData.append('registry', registryFile);

    try {
      const res = await fetch('/api/suppliers/reconcile', {
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
      const res = await fetch('/api/suppliers/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      if (!res.ok) throw new Error('Erro ao gerar o arquivo Excel.');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'conciliacao_fornecedores.xlsx';
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
        <h2 className="text-xl font-semibold text-pkf-navy mb-1">Conciliação de Fornecedores</h2>
        <p className="text-sm text-gray-500 mb-6">
          Envie o balancete contábil, a planilha de fornecedores e o cadastro de fornecedores. O código do
          fornecedor é localizado no cadastro (PROCV) para obter a conta contábil correspondente, e a
          conciliação é feita por conta contábil — os nomes não são usados na comparação, pois podem
          divergir entre as planilhas. Somente fornecedores nacionais são conciliados — fornecedores
          estrangeiros são descartados do resultado.
        </p>

        <div className="mb-6 max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="supplier-profile">
            Cliente
          </label>
          <select
            id="supplier-profile"
            value={supplierProfile}
            onChange={(e) => setSupplierProfile(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pkf-navy/30 cursor-pointer"
          >
            {SUPPLIER_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <FileUploadField
            label="Balancete Contábil"
            hint="Excel (.xlsx, .xls)"
            accept=".xlsx,.xls"
            file={balanceteFile}
            onChange={setBalanceteFile}
          />
          <FileUploadField
            label="Planilha de Fornecedores"
            hint="Excel (.xlsx, .xls) — código e total"
            accept=".xlsx,.xls"
            file={suppliersFile}
            onChange={setSuppliersFile}
          />
          <FileUploadField
            label="Cadastro de Fornecedores"
            hint="Excel (.xlsx, .xls) — código e conta contábil"
            accept=".xlsx,.xls"
            file={registryFile}
            onChange={setRegistryFile}
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
            <SummaryCard label="Com Diferença" value={result.summary.totalDifferences} color="orange" />
            <SummaryCard label="Fornecedores" value={result.summary.totalSuppliers} color="magenta" />
            <SummaryCard
              label="Diferença Total"
              value={currency.format(result.summary.difference)}
              color="cyan"
            />
          </div>

          {result.summary.totalDiscardedForeign > 0 && (
            <p className="text-xs text-gray-400">
              {result.summary.totalDiscardedForeign} fornecedor(es) estrangeiro(s) descartado(s) do resultado.
            </p>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-pkf-navy">
                Diferenças por Fornecedor ({result.differences.length})
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
                      <th className="py-2 pr-4">Fornecedor</th>
                      <th className="py-2 pr-4">Conta Contábil</th>
                      <th className="py-2 pr-4 text-right">Saldo Balancete</th>
                      <th className="py-2 pr-4 text-right">Total Fornecedor</th>
                      <th className="py-2 pr-4 text-right">Diferença</th>
                      <th className="py-2 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.differences.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 pr-4 max-w-xs truncate" title={item.supplier}>
                          {item.supplier}
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">{item.account}</td>
                        <td className="py-2 pr-4 text-right whitespace-nowrap">
                          {currency.format(item.balanceteValue)}
                        </td>
                        <td className="py-2 pr-4 text-right whitespace-nowrap">
                          {currency.format(item.supplierValue)}
                        </td>
                        <td className="py-2 pr-4 text-right whitespace-nowrap">
                          {currency.format(item.difference)}
                        </td>
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
  const color = status === 'Diferença de valor' ? COLOR_MAP.cyan : COLOR_MAP.orange;
  return <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full border ${color}`}>{status}</span>;
}
