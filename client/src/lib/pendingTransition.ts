"use client";

/**
 * Session-local marker for an in-flight wallet-profile transition (#136.8).
 *
 * A screened transition can outlive the propose window (runtime retries,
 * slow RPC) and the upgrade dialog with it — the transition still executes
 * server-side, but nothing on the client re-pulled the record, so the
 * upgrade banner kept nudging forever. The flow that receives a
 * `pending: true` result notes it here; UpgradeBanner (mounted on home and
 * settings) polls the record while the marker is live and shows an honest
 * "upgrade in progress" state instead of the nudge.
 *
 * sessionStorage on purpose: survives navigation, dies with the tab — a
 * marker must never outlive the session that created the transition.
 */

const KEY = "zhentan_pending_transition";
/** Give up watching after this long — the nudge (or reality) wins again. */
const MAX_AGE_MS = 5 * 60_000;

export interface PendingTransitionMarker {
  /** The profile the transition ends in. */
  target: "starter" | "guarded" | "protected" | "detached";
  at: number;
}

export function notePendingTransition(target: PendingTransitionMarker["target"]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ target, at: Date.now() }));
    window.dispatchEvent(new Event("zhentan:pending-transition"));
  } catch {
    // no storage → the dialog's own polling remains the only watcher
  }
}

export function readPendingTransition(): PendingTransitionMarker | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingTransitionMarker;
    if (!parsed?.target || Date.now() - parsed.at > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingTransition(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}
