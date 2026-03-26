/**
 * Check if there are pending transactions awaiting agent review.
 * Usage: node check-pending.js [safeAddress]
 */
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const safeArg = process.argv[2];

if (!safeArg) {
  console.error(JSON.stringify({ status: 'error', message: 'Usage: node check-pending.js <safeAddress>' }));
  process.exit(1);
}

try {
  // Check screening mode and get patterns/settings
  const statusRes = await fetch(`${SERVER_URL}/status?safe=${safeArg}`);
  if (!statusRes.ok) {
    const err = await statusRes.json().catch(() => ({ error: statusRes.statusText }));
    throw new Error(err.error || statusRes.statusText);
  }
  const { screeningMode } = await statusRes.json();

  if (!screeningMode) {
    console.log(JSON.stringify({ status: 'screening_off', message: 'Screening mode is OFF. Skipping check.' }));
    process.exit(0);
  }

  // Fetch pending transactions
  const txRes = await fetch(`${SERVER_URL}/transactions?safeAddress=${safeArg}`);
  if (!txRes.ok) {
    const err = await txRes.json().catch(() => ({ error: txRes.statusText }));
    throw new Error(err.error || txRes.statusText);
  }
  const { transactions } = await txRes.json();

  const pending = transactions.filter(tx => !tx.executedAt && !tx.inReview && !tx.rejected);

  if (pending.length === 0) {
    console.log(JSON.stringify({ status: 'empty', message: 'No pending transactions.' }));
  } else {
    console.log(JSON.stringify({
      status: 'has_pending',
      count: pending.length,
      transactions: pending,
    }, null, 2));
  }
} catch (err) {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
}
