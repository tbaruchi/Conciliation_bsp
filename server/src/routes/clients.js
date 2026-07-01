import express from 'express';
import multer from 'multer';
import path from 'path';
import { parseClientAccountBalances } from '../services/clientAccountParser.js';
import { parseClientRegistry, parseClientTotals } from '../services/clientParser.js';
import { reconcileClients } from '../services/clientReconciliation.js';
import { buildClientReconciliationWorkbook } from '../services/exportExcel.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Each client's balancete highlights national accounts with its own convention. Profiles are
// validated against real client files before being added here — the combo box on the client
// lets the user pick a known, tested client instead of guessing at an unfamiliar file layout.
const CLIENT_PROFILES = {
  iwaki: { label: 'IWAKI do Brasil', highlightColor: 'FFFF00' },
};
const DEFAULT_PROFILE = { label: 'Genérico', highlightColor: 'FFFF00' };

function checkExcel(file, label) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.xlsx' && ext !== '.xls') {
    throw new Error(`${label} deve estar em formato Excel (.xlsx ou .xls).`);
  }
}

router.get('/profiles', (req, res) => {
  const profiles = Object.entries(CLIENT_PROFILES).map(([id, profile]) => ({ id, label: profile.label }));
  res.json({ profiles });
});

router.post(
  '/reconcile',
  upload.fields([
    { name: 'balancete', maxCount: 1 },
    { name: 'clients', maxCount: 1 },
    { name: 'registry', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const balanceteFile = req.files?.balancete?.[0];
      const clientsFile = req.files?.clients?.[0];
      const registryFile = req.files?.registry?.[0];

      if (!balanceteFile || !clientsFile || !registryFile) {
        return res.status(400).json({
          error: 'Envie o balancete contábil, a planilha de clientes e o cadastro de clientes.',
        });
      }

      checkExcel(balanceteFile, 'O balancete contábil');
      checkExcel(clientsFile, 'A planilha de clientes');
      checkExcel(registryFile, 'O cadastro de clientes');

      const profile = CLIENT_PROFILES[req.body.clientProfile] || DEFAULT_PROFILE;

      const balanceteEntries = parseClientAccountBalances(balanceteFile.buffer, {
        highlightColor: profile.highlightColor,
      });
      const clientEntries = parseClientTotals(clientsFile.buffer);
      const registryEntries = parseClientRegistry(registryFile.buffer);

      if (balanceteEntries.length === 0) {
        return res.status(400).json({ error: 'Nenhuma conta encontrada no balancete contábil.' });
      }
      if (clientEntries.length === 0) {
        return res.status(400).json({ error: 'Nenhum cliente encontrado na planilha de clientes.' });
      }
      if (registryEntries.length === 0) {
        return res.status(400).json({ error: 'Nenhum cliente encontrado no cadastro de clientes.' });
      }

      const result = reconcileClients(balanceteEntries, clientEntries, registryEntries);
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

    const buffer = buildClientReconciliationWorkbook(result);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="conciliacao_clientes.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar o arquivo Excel.' });
  }
});

export default router;
