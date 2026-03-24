import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = join(__dirname, 'invoice-queue.json');

try {
  const raw = process.argv[2];
  if (!raw) {
    console.error(JSON.stringify({ status: 'error', message: 'Usage: node queue-invoice.js \'<json>\'' }));
    process.exit(1);
  }

  const invoice = JSON.parse(raw);

  // Validate required fields
  if (!invoice.to || !invoice.amount || !invoice.token) {
    console.error(JSON.stringify({ status: 'error', message: 'Missing required fields: to, amount, token' }));
    process.exit(1);
  }

  const id = `inv-${randomUUID().slice(0, 8)}`;

  const entry = {
    id,
    to: invoice.to,
    amount: invoice.amount,
    token: invoice.token,
    invoiceNumber: invoice.invoiceNumber || null,
    issueDate: invoice.issueDate || null,
    dueDate: invoice.dueDate || null,
    billedFrom: invoice.billedFrom || null,
    billedTo: invoice.billedTo || null,
    services: invoice.services || [],
    riskScore: invoice.riskScore ?? null,
    riskNotes: invoice.riskNotes || null,
    sourceChannel: invoice.sourceChannel || 'unknown',
    queuedAt: new Date().toISOString(),
    status: 'queued',
  };

  // Read existing queue or create new
  let queue;
  try {
    queue = JSON.parse(readFileSync(QUEUE_FILE, 'utf8'));
  } catch {
    queue = { invoices: [] };
  }

  queue.invoices.push(entry);
  writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));

  console.log(JSON.stringify({
    status: 'queued',
    id: entry.id,
    to: entry.to,
    amount: entry.amount,
    token: entry.token,
  }));
} catch (err) {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
}
