# Conciliação BSP

Aplicação web para automação das conciliações da empresa, com abas para Banco, Clientes, Fornecedores e Impostos.

## Estrutura

- `client/` — Frontend em React + Vite + Tailwind CSS
- `server/` — Backend em Node.js + Express, responsável por processar os arquivos e executar a conciliação
- `offline/index.html` — Versão em página única (HTML/CSS/JS), sem dependência de servidor. Basta abrir o arquivo em um navegador (Chrome/Edge) para usar offline.

## Versão offline (página única)

Abra `offline/index.html` diretamente no navegador — não requer instalação, internet ou backend. Toda a leitura de Excel/PDF, a conciliação e a geração do Excel de resultado são feitas localmente no navegador.

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

## Conciliação de Fornecedores

Na aba **Fornecedores**, envie:

1. **Balancete Contábil** (Excel `.xlsx`/`.xls`) — deve conter colunas de Conta Contábil e Saldo/Total.
2. **Planilha de Fornecedores** (Excel `.xlsx`/`.xls`) — deve conter colunas de Fornecedor, Conta Contábil e Total.

Ao clicar em **Iniciar Conciliação**, o sistema compara, para cada conta contábil, o saldo do balancete com o total da planilha de fornecedores, apontando:

- Fornecedores conciliados (saldo do balancete igual ao total da planilha)
- Fornecedores com diferença de valor entre o balancete e a planilha
- Contas presentes apenas no balancete ou apenas na planilha de fornecedores

O resultado pode ser exportado para Excel pelo botão **Exportar para Excel**.

As abas **Clientes** e **Impostos** estão em desenvolvimento.
