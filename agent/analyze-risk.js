/**
 * Fetch risk analysis for a pending transaction.
 * The server computes risk scores via analyzeRisk() on every transaction fetch.
 * Usage: node analyze-risk.js <tx-id> <safeAddress>
 */
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const txId = process.argv[2];
const safeArg = process.argv[3];

if (!txId || !safeArg) {
  console.error(JSON.stringify({ status: 'error', message: 'Usage: node analyze-risk.js <tx-id> <safeAddress>' }));
  process.exit(1);
}

try {
  const res = await fetch(`${SERVER_URL}/transactions/${txId}`);
  if (!res.ok) {
    if (res.status === 404) {
      console.log(JSON.stringify({ status: 'not_found', message: `Transaction ${txId} not found.` }));
      process.exit(1);
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  const { transaction: tx } = await res.json();

  console.log(JSON.stringify({
    txId: tx.id,
    to: tx.to,
    amount: tx.amount,
    token: tx.token,
    riskScore: tx.riskScore ?? null,
    verdict: tx.riskVerdict ?? null,
    reasons: tx.riskReasons ?? [],
  }, null, 2));
} catch (err) {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
}
