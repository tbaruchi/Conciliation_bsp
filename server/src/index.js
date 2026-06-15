import express from 'express';
import cors from 'cors';
import bankRouter from './routes/bank.js';
import suppliersRouter from './routes/suppliers.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/bank', bankRouter);
app.use('/api/suppliers', suppliersRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
