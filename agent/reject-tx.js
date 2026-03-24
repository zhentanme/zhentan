/**
 * Reject a transaction that was in review.
 * Usage: node skills/zhentan/reject-tx.js <tx-id> [reason]
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const queuePath = join(__dirname, 'pending-queue.json');

const txId = process.argv[2];
const reason = process.argv.slice(3).join(' ') || 'Rejected by owner';

if (!txId) {
  console.error('Usage: node reject-tx.js <tx-id> [reason]');
  process.exit(1);
}

try {
  const queue = JSON.parse(readFileSync(queuePath, 'utf8'));
  const tx = queue.pending.find(t => t.id === txId);

  if (!tx) {
    console.log(JSON.stringify({ status: 'not_found', message: `${txId} not found.` }));
    process.exit(1);
  }

  tx.rejected = true;
  tx.rejectedAt = new Date().toISOString();
  tx.rejectReason = reason;
  delete tx.inReview;

  writeFileSync(queuePath, JSON.stringify(queue, null, 2));
  console.log(JSON.stringify({
    status: 'rejected',
    txId,
    to: tx.to,
    amount: tx.amount,
    reason,
  }));
} catch (err) {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
}
