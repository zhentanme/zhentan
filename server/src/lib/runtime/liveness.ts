/**
 * Runtime liveness (#136.5) — the truth behind every "agent online" claim.
 *
 * The runtime long-polls /runtime/lease continuously (and heartbeats leased
 * jobs), so any authenticated Runtime API call is proof of life. The stamp
 * is in-process state: acceptable under the documented single-process
 * constraint (PM2 instances: 1 — the same constraint the sponsor nonce
 * manager already relies on).
 *
 * No stamp yet (fresh boot) reports offline until the first poll arrives —
 * fail-closed, matching the screening path's own posture. RUNTIME_API_TOKEN
 * unset means no runtime can ever authenticate: permanently offline.
 */

/** A poll gap beyond this reads as offline (default poll interval is seconds). */
const LIVENESS_WINDOW_MS = Number(process.env.RUNTIME_LIVENESS_WINDOW_MS || 90_000);

let lastSeenAt: number | null = null;

/** Called from authenticated Runtime API handlers. */
export function markRuntimeSeen(): void {
  lastSeenAt = Date.now();
}

export interface RuntimeLiveness {
  online: boolean;
  /** Seconds since the last authenticated runtime call; null = never seen. */
  lastSeenSecondsAgo: number | null;
}

export function runtimeLiveness(): RuntimeLiveness {
  if (!process.env.RUNTIME_API_TOKEN) return { online: false, lastSeenSecondsAgo: null };
  if (lastSeenAt === null) return { online: false, lastSeenSecondsAgo: null };
  const ago = Date.now() - lastSeenAt;
  return { online: ago <= LIVENESS_WINDOW_MS, lastSeenSecondsAgo: Math.round(ago / 1000) };
}
