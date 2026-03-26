/**
 * Co-sign and execute a pending transaction via the server.
 * Usage: node sign-and-execute.js <tx-id>
 */
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const txId = process.argv[2];

if (!txId) {
  console.error(JSON.stringify({ status: 'error', message: 'Usage: node sign-and-execute.js <tx-id>' }));
  process.exit(1);
}

try {
  // Pre-check: verify tx exists and is ready
  const checkRes = await fetch(`${SERVER_URL}/transactions/${txId}`);
  if (!checkRes.ok) {
    if (checkRes.status === 404) {
      console.log(JSON.stringify({ status: 'not_found', message: `${txId} not in queue.` }));
      process.exit(1);
    }
    const err = await checkRes.json().catch(() => ({ error: checkRes.statusText }));
    throw new Error(err.error || checkRes.statusText);
  }

  const { transaction: tx } = await checkRes.json();

  if (tx.executedAt) {
    console.log(JSON.stringify({ status: 'already_executed', txHash: tx.txHash }));
    process.exit(0);
  }
  if (!tx.userOp || Object.keys(tx.userOp).length === 0) {
    console.log(JSON.stringify({ status: 'no_userop', message: `${txId} has no userOp data. Cannot co-sign.` }));
    process.exit(1);
  }

  // Execute via server
  const execRes = await fetch(`${SERVER_URL}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txId }),
  });

  if (!execRes.ok) {
    const err = await execRes.json().catch(() => ({ error: execRes.statusText }));
    throw new Error(err.error || execRes.statusText);
  }

  const result = await execRes.json();
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
}
