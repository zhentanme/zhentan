/**
 * Record behavioral patterns for a transaction.
 * NOTE: Patterns are now automatically updated by the server when a transaction
 * is executed via POST /execute. This script is a no-op kept for compatibility.
 * Usage: node record-pattern.js <tx-id>
 */
const txId = process.argv[2];
if (!txId) {
  console.error(JSON.stringify({ status: 'error', message: 'Usage: node record-pattern.js <tx-id>' }));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'noop',
  message: 'Patterns are automatically updated by the server on execution. No action needed.',
  txId,
}));
