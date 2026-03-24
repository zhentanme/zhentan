/**
 * Delegates to the real agent-sign.js in the zhentan project.
 * Checks the pending queue first, then spawns the signing script.
 *
 * Usage: node skills/zhentan/sign-and-execute.js <tx-id>
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENT_SIGN_SCRIPT = '/home/koshik/Documents/repos/zhentan/scripts/agent-sign.js';
const SCRIPTS_DIR = '/home/koshik/Documents/repos/zhentan/scripts';

const txId = process.argv[2];
if (!txId) {
  console.error('Usage: node sign-and-execute.js <tx-id>');
  process.exit(1);
}

// Pre-check: does the tx exist and have a userOp?
const queuePath = join(__dirname, 'pending-queue.json');
const queue = JSON.parse(readFileSync(queuePath, 'utf8'));
const tx = queue.pending.find(t => t.id === txId);

if (!tx) {
  console.log(JSON.stringify({ status: 'not_found', message: `${txId} not in queue.` }));
  process.exit(1);
}
if (tx.executedAt) {
  console.log(JSON.stringify({ status: 'already_executed', txHash: tx.txHash }));
  process.exit(0);
}
if (!tx.userOp) {
  console.log(JSON.stringify({ status: 'no_userop', message: `${txId} has no userOp data. Cannot co-sign.` }));
  process.exit(1);
}

// Delegate to the real signing script (runs in repo scripts/ dir for .env access)
try {
  const output = execSync(`node ${AGENT_SIGN_SCRIPT} ${txId}`, {
    cwd: SCRIPTS_DIR,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, QUEUE_PATH: queuePath },
  });
  console.log(output);
} catch (err) {
  console.error(JSON.stringify({
    status: 'error',
    message: err.stderr || err.message,
  }));
  process.exit(1);
}
