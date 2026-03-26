/**
 * Toggle screening mode on or off for a Safe.
 * Usage: node toggle-screening.js <on|off> <safeAddress>
 */
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const arg = process.argv[2];
const safeArg = process.argv[3];

if (!arg || !['on', 'off'].includes(arg.toLowerCase()) || !safeArg) {
  console.error(JSON.stringify({ status: 'error', message: 'Usage: node toggle-screening.js <on|off> <safeAddress>' }));
  process.exit(1);
}

try {
  const newMode = arg.toLowerCase() === 'on';
  const res = await fetch(`${SERVER_URL}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ safe: safeArg, screeningMode: newMode }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  const data = await res.json();
  console.log(JSON.stringify({
    status: 'ok',
    screeningMode: data.screeningMode,
    safe: safeArg,
    message: `Screening mode ${data.screeningMode ? 'ON' : 'OFF'} for ${safeArg}.`,
  }));
} catch (err) {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
}
