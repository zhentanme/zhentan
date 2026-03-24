import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const raw = JSON.parse(readFileSync(join(__dirname, 'state.json'), 'utf8'));
  const state = raw.users ? raw : { users: { default: raw } };

  const safeArg = process.argv[2]?.toLowerCase();

  // Check if any user (or a specific user) has screening on
  let screeningOn = false;
  if (safeArg) {
    const userState = state.users[safeArg];
    screeningOn = userState?.screeningMode ?? false;
  } else {
    screeningOn = Object.values(state.users).some(u => u.screeningMode);
  }

  if (!screeningOn) {
    console.log(JSON.stringify({ status: 'screening_off', message: 'Screening mode is OFF. Skipping check.' }));
    process.exit(0);
  }

  const queue = JSON.parse(readFileSync(join(__dirname, 'pending-queue.json'), 'utf8'));
  let pending = queue.pending.filter(tx => !tx.executedAt && !tx.inReview && !tx.rejected);

  // If a specific safe was requested, filter to that safe's transactions
  if (safeArg) {
    pending = pending.filter(tx => tx.safeAddress?.toLowerCase() === safeArg);
  }

  if (pending.length === 0) {
    console.log(JSON.stringify({ status: 'empty', message: 'No pending transactions.' }));
  } else {
    console.log(JSON.stringify({
      status: 'has_pending',
      count: pending.length,
      transactions: pending
    }, null, 2));
  }
} catch (err) {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
}
