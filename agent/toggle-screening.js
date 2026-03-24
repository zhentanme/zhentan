import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const statePath = join(__dirname, 'state.json');

const arg = process.argv[2];
const safeArg = process.argv[3]?.toLowerCase();

if (!arg || !['on', 'off'].includes(arg.toLowerCase())) {
  console.error('Usage: node toggle-screening.js <on|off> [safeAddress]');
  process.exit(1);
}

try {
  const raw = JSON.parse(readFileSync(statePath, 'utf8'));
  const state = raw.users ? raw : { users: { default: raw } };
  const newMode = arg.toLowerCase() === 'on';

  if (safeArg) {
    if (!state.users[safeArg]) {
      state.users[safeArg] = { screeningMode: false, lastCheck: null, decisions: [] };
    }
    state.users[safeArg].screeningMode = newMode;
  } else {
    // Toggle for all users
    for (const key of Object.keys(state.users)) {
      state.users[key].screeningMode = newMode;
    }
  }

  writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(JSON.stringify({
    status: 'ok',
    screeningMode: newMode,
    safe: safeArg || 'all',
    message: `Screening mode ${newMode ? 'ON' : 'OFF'}${safeArg ? ` for ${safeArg}` : ' for all users'}.`
  }));
} catch (err) {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
}
