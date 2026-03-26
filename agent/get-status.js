/**
 * Get the current status for a Safe: screening mode, patterns, limits.
 * Usage: node get-status.js <safeAddress>
 */
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const safeArg = process.argv[2];

if (!safeArg) {
  console.error(JSON.stringify({ status: 'error', message: 'Usage: node get-status.js <safeAddress>' }));
  process.exit(1);
}

try {
  const res = await fetch(`${SERVER_URL}/status?safe=${safeArg}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
} catch (err) {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
}
