# Conciliação BSP

Aplicação web para automação das conciliações da empresa, com abas para Banco, Clientes, Fornecedores e Impostos.

## Estrutura

- `client/` — Frontend em React + Vite + Tailwind CSS
- `server/` — Backend em Node.js + Express, responsável por processar os arquivos e executar a conciliação

## Como executar

### Backend

```bash
cd server
npm install
npm start
```

O servidor inicia em `http://localhost:3001`.

### Frontend

```bash
cd client
npm install
npm run dev
```

A aplicação inicia em `http://localhost:5173` e já está configurada com proxy para a API do backend.

## Conciliação Bancária

Na aba **Banco**, envie:

1. **Razão Contábil** (Excel `.xlsx`/`.xls`) — deve conter colunas de Data, Título/Documento/Histórico e Valor (ou Débito/Crédito).
2. **Extrato Bancário** (Excel `.xlsx`/`.xls` ou PDF `.pdf`).

Ao clicar em **Iniciar Conciliação**, o sistema compara os lançamentos por valor e data, apontando:

- Itens conciliados (presentes em ambos os relatórios)
- Itens presentes apenas no razão contábil
- Itens presentes apenas no extrato bancário

O resultado pode ser exportado para Excel pelo botão **Exportar para Excel**.

As abas **Clientes**, **Fornecedores** e **Impostos** estão em desenvolvimento.
