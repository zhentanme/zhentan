import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const raw = JSON.parse(readFileSync(join(__dirname, 'state.json'), 'utf8'));
  const state = raw.users ? raw : { users: { default: raw } };
  const patterns = JSON.parse(readFileSync(join(__dirname, 'patterns.json'), 'utf8'));

  const safeArg = process.argv[2]?.toLowerCase();
  const knownRecipients = Object.keys(patterns.recipients).length;

  if (safeArg) {
    const userState = state.users[safeArg];
    if (!userState) {
      console.log(JSON.stringify({ status: 'not_found', message: `No state for ${safeArg}` }));
      process.exit(0);
    }
    const recentDecisions = (userState.decisions || []).slice(-10);
    console.log(JSON.stringify({
      safe: safeArg,
      screeningMode: userState.screeningMode,
      lastCheck: userState.lastCheck,
      knownRecipients,
      globalLimits: patterns.globalLimits,
      recentDecisions
    }, null, 2));
  } else {
    // Report all users
    const result = {};
    for (const [safe, userState] of Object.entries(state.users)) {
      result[safe] = {
        screeningMode: userState.screeningMode,
        lastCheck: userState.lastCheck,
        recentDecisions: (userState.decisions || []).slice(-10)
      };
    }
    console.log(JSON.stringify({
      users: result,
      knownRecipients,
      globalLimits: patterns.globalLimits
    }, null, 2));
  }
} catch (err) {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
}
