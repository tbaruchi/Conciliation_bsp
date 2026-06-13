import { PDFParse } from 'pdf-parse';
import { parseAmount, parseDateValue } from '../utils/normalize.js';

const DATE_AT_START = /^(\d{2}[\/\-.]\d{2}[\/\-.]\d{2,4})\s+(.*)$/;
const AMOUNT_AT_END = /(.*?)\s*(-?\(?\s*R?\$?\s*-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\s*\)?\s*[DC]?)\s*$/i;

/**
 * Parses a bank statement PDF buffer into a normalized list of entries.
 * Returns: [{ title, document, description, date, value }]
 */
export async function parsePdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  await parser.destroy();
  const lines = data.text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const entries = [];

  for (const line of lines) {
    const dateMatch = line.match(DATE_AT_START);
    if (!dateMatch) continue;

    const date = parseDateValue(dateMatch[1]);
    const rest = dateMatch[2];

    const amountMatch = rest.match(AMOUNT_AT_END);
    if (!amountMatch) continue;

    const description = amountMatch[1].trim();
    const value = parseAmount(amountMatch[2]);

    if (!description || value === null || value === 0) continue;

    // Skip lines that look like running balances ("saldo", "saldo do dia")
    if (/^saldo/i.test(description)) continue;

    entries.push({
      title: description,
      document: '',
      description,
      date,
      value: Math.round(value * 100) / 100,
    });
  }

  return entries;
}
