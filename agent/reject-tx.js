/**
 * Reject a transaction that was in review.
 * Usage: node reject-tx.js <tx-id> [reason]
 */
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const txId = process.argv[2];
const reason = process.argv.slice(3).join(' ') || 'Rejected by owner';

if (!txId) {
  console.error(JSON.stringify({ status: 'error', message: 'Usage: node reject-tx.js <tx-id> [reason]' }));
  process.exit(1);
}

try {
  const res = await fetch(`${SERVER_URL}/transactions/${txId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reject', reason }),
  });

  if (!res.ok) {
    if (res.status === 404) {
      console.log(JSON.stringify({ status: 'not_found', message: `${txId} not found.` }));
      process.exit(1);
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  const data = await res.json();
  console.log(JSON.stringify({ ...data, reason }));
} catch (err) {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
}
