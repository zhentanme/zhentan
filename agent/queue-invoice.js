/**
 * Queue an invoice for payment processing.
 * Usage: node queue-invoice.js '<json>'
 *
 * JSON fields: to (required), amount (required), token (required),
 *   invoiceNumber, issueDate, dueDate, billedFrom, billedTo,
 *   services, riskScore, riskNotes, sourceChannel
 */
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';

try {
  const raw = process.argv[2];
  if (!raw) {
    console.error(JSON.stringify({ status: 'error', message: "Usage: node queue-invoice.js '<json>'" }));
    process.exit(1);
  }

  const invoice = JSON.parse(raw);

  if (!invoice.to || !invoice.amount || !invoice.token) {
    console.error(JSON.stringify({ status: 'error', message: 'Missing required fields: to, amount, token' }));
    process.exit(1);
  }

  const res = await fetch(`${SERVER_URL}/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(invoice),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  const data = await res.json();
  console.log(JSON.stringify(data));
} catch (err) {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
}
