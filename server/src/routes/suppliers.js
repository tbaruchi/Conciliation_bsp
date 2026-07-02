import express from 'express';
import multer from 'multer';
import path from 'path';
import { parseAccountBalances } from '../services/accountParser.js';
import { parseSupplierRegistry, parseSupplierTotals } from '../services/supplierParser.js';
import { reconcileSuppliers } from '../services/supplierReconciliation.js';
import { buildSupplierReconciliationWorkbook } from '../services/exportExcel.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// The reconciliation logic itself is fully generic (account group and nationality are both
// detected from the balancete's own descriptions, not a hardcoded prefix or per-client rule), so
// this registry exists purely so the combo box can show which clients have already been
// validated against real files — a reminder of what's been tested, not a functional switch.
const SUPPLIER_PROFILES = {
  sh: { label: 'SH do Brasil' },
  emuge: { label: 'EMUGE-FRANKEN' },
  iwaki: { label: 'IWAKI do Brasil' },
};

function checkExcel(file, label) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.xlsx' && ext !== '.xls') {
    throw new Error(`${label} deve estar em formato Excel (.xlsx ou .xls).`);
  }
}

router.get('/profiles', (req, res) => {
  const profiles = Object.entries(SUPPLIER_PROFILES).map(([id, profile]) => ({ id, label: profile.label }));
  res.json({ profiles });
});

router.post(
  '/reconcile',
  upload.fields([
    { name: 'balancete', maxCount: 1 },
    { name: 'suppliers', maxCount: 1 },
    { name: 'registry', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const balanceteFile = req.files?.balancete?.[0];
      const suppliersFile = req.files?.suppliers?.[0];
      const registryFile = req.files?.registry?.[0];

      if (!balanceteFile || !suppliersFile || !registryFile) {
        return res.status(400).json({
          error: 'Envie o balancete contábil, a planilha de fornecedores e o cadastro de fornecedores.',
        });
      }

      checkExcel(balanceteFile, 'O balancete contábil');
      checkExcel(suppliersFile, 'A planilha de fornecedores');
      checkExcel(registryFile, 'O cadastro de fornecedores');

      const balanceteEntries = parseAccountBalances(balanceteFile.buffer);
      const supplierEntries = parseSupplierTotals(suppliersFile.buffer);
      const registryEntries = parseSupplierRegistry(registryFile.buffer);

      if (balanceteEntries.length === 0) {
        return res.status(400).json({ error: 'Nenhuma conta encontrada no balancete contábil.' });
      }
      if (supplierEntries.length === 0) {
        return res.status(400).json({ error: 'Nenhum fornecedor encontrado na planilha de fornecedores.' });
      }
      if (registryEntries.length === 0) {
        return res.status(400).json({ error: 'Nenhum fornecedor encontrado no cadastro de fornecedores.' });
      }

      const result = reconcileSuppliers(balanceteEntries, supplierEntries, registryEntries);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message || 'Erro ao processar os arquivos.' });
    }
  }
);

router.post('/export', express.json({ limit: '10mb' }), (req, res) => {
  try {
    const result = req.body;
    if (!result || !result.summary || !result.differences) {
      return res.status(400).json({ error: 'Dados de conciliação inválidos.' });
    }

    const buffer = buildSupplierReconciliationWorkbook(result);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="conciliacao_fornecedores.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar o arquivo Excel.' });
  }
});

export default router;
