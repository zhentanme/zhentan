/**
 * Mark a pending transaction as "in review" so the cron job skips it.
 * Usage: node skills/zhentan/mark-review.js <tx-id> [reason]
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const queuePath = join(__dirname, 'pending-queue.json');

const txId = process.argv[2];
const reason = process.argv.slice(3).join(' ') || 'Flagged for manual review';

if (!txId) {
  console.error('Usage: node mark-review.js <tx-id> [reason]');
  process.exit(1);
}

try {
  const queue = JSON.parse(readFileSync(queuePath, 'utf8'));
  const tx = queue.pending.find(t => t.id === txId);

  if (!tx) {
    console.log(JSON.stringify({ status: 'not_found', message: `${txId} not found.` }));
    process.exit(1);
  }

  tx.inReview = true;
  tx.reviewReason = reason;
  tx.reviewedAt = new Date().toISOString();

  writeFileSync(queuePath, JSON.stringify(queue, null, 2));
  console.log(JSON.stringify({ status: 'marked_review', txId, reason }));
} catch (err) {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
}
