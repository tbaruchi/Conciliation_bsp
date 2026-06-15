import express from 'express';
import multer from 'multer';
import path from 'path';
import { parseAccountBalances } from '../services/accountParser.js';
import { reconcileSuppliers } from '../services/supplierReconciliation.js';
import { buildSupplierReconciliationWorkbook } from '../services/exportExcel.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function parseSpreadsheet(file, label) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    return parseAccountBalances(file.buffer);
  }
  throw new Error(`${label} deve estar em formato Excel (.xlsx ou .xls).`);
}

router.post(
  '/reconcile',
  upload.fields([
    { name: 'balancete', maxCount: 1 },
    { name: 'suppliers', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const balanceteFile = req.files?.balancete?.[0];
      const suppliersFile = req.files?.suppliers?.[0];

      if (!balanceteFile || !suppliersFile) {
        return res.status(400).json({ error: 'Envie o balancete contábil e a planilha de fornecedores.' });
      }

      const balanceteEntries = parseSpreadsheet(balanceteFile, 'O balancete contábil');
      const supplierEntries = parseSpreadsheet(suppliersFile, 'A planilha de fornecedores');

      if (balanceteEntries.length === 0) {
        return res.status(400).json({ error: 'Nenhuma conta encontrada no balancete contábil.' });
      }
      if (supplierEntries.length === 0) {
        return res.status(400).json({ error: 'Nenhum fornecedor encontrado na planilha de fornecedores.' });
      }

      const result = reconcileSuppliers(balanceteEntries, supplierEntries);
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
