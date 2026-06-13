import express from 'express';
import multer from 'multer';
import path from 'path';
import { parseExcel } from '../services/excelParser.js';
import { parsePdf } from '../services/pdfParser.js';
import { reconcileBank } from '../services/reconciliation.js';
import { buildBankReconciliationWorkbook } from '../services/exportExcel.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

async function parseLedgerFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    return parseExcel(file.buffer);
  }
  throw new Error('O relatório razão contábil deve estar em formato Excel (.xlsx ou .xls).');
}

async function parseStatementFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    return parseExcel(file.buffer);
  }
  if (ext === '.pdf') {
    return parsePdf(file.buffer);
  }
  throw new Error('O extrato bancário deve estar em formato Excel (.xlsx, .xls) ou PDF (.pdf).');
}

router.post(
  '/reconcile',
  upload.fields([
    { name: 'ledger', maxCount: 1 },
    { name: 'statement', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const ledgerFile = req.files?.ledger?.[0];
      const statementFile = req.files?.statement?.[0];

      if (!ledgerFile || !statementFile) {
        return res.status(400).json({ error: 'Envie o razão contábil e o extrato bancário.' });
      }

      const ledgerEntries = await parseLedgerFile(ledgerFile);
      const statementEntries = await parseStatementFile(statementFile);

      if (ledgerEntries.length === 0) {
        return res.status(400).json({ error: 'Nenhum lançamento encontrado no razão contábil.' });
      }
      if (statementEntries.length === 0) {
        return res.status(400).json({ error: 'Nenhum lançamento encontrado no extrato bancário.' });
      }

      const result = reconcileBank(ledgerEntries, statementEntries);
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

    const buffer = buildBankReconciliationWorkbook(result);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="conciliacao_bancaria.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar o arquivo Excel.' });
  }
});

export default router;
