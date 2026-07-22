"use client";

// Guided product tours — definitions and device-local seen-flags.
//
// Anchors are `data-tour` attributes on live UI (nav items, the agent rail,
// the mobile status pill, settings cards). A step lists selectors in
// PREFERENCE order; the first VISIBLE match wins, which is how one step
// serves both the desktop sidebar and the mobile bottom nav. A step whose
// selectors all resolve to nothing (e.g. the xl-only agent rail on a phone
// with no fallback) is skipped silently.

export interface TourStep {
  id: string;
  /** Selectors tried in order; none/empty → centered brand card. */
  targets?: string[];
  /** Navigate here first (no-op when already on the route). */
  route?: string;
  title: string;
  body: string;
  /** Copy override when a fallback selector (index > 0) matched. */
  fallbackBody?: string;
  /** Show the TwinTick brand mark (welcome/done beats). */
  brand?: boolean;
}

export interface TourDefinition {
  /** Storage key suffix — one flag per tour per Safe. */
  key: string;
  steps: TourStep[];
  finishLabel?: string;
  /** Fired once when the tour ends (finished or skipped). */
  onClose?: () => void;
}

// ── Seen-flags (device-local, deliberately NOT wiped on logout — replaying
// the tour on every re-login would read as a bug; flags are per-Safe). ──────

const PREFIX = "zhentan_tour_";

export function hasSeenTour(key: string, safeAddress: string): boolean {
  try {
    return localStorage.getItem(`${PREFIX}${key}_${safeAddress.toLowerCase()}`) === "1";
  } catch {
    return true; // no storage → never auto-fire
  }
}

export function markTourSeen(key: string, safeAddress: string) {
  try {
    localStorage.setItem(`${PREFIX}${key}_${safeAddress.toLowerCase()}`, "1");
  } catch {
    // best-effort
  }
}

// ── Definitions ─────────────────────────────────────────────────────────────

/** First-time walkthrough: requests → agent → settings. */
export function mainTour(safeAddress: string): TourDefinition {
  return {
    key: "main",
    finishLabel: "Let's go",
    onClose: () => markTourSeen("main", safeAddress),
    steps: [
      {
        id: "welcome",
        brand: true,
        title: "Meet your co-signer",
        body: "Zhentan screens every transaction before it moves your money. Here's your wallet in thirty seconds.",
      },
      {
        id: "requests",
        targets: ['[data-tour="nav-requests"]'],
        title: "Requests land here",
        body: "Payment requests and anything waiting on your signature. The badge shows when you're needed.",
      },
      {
        id: "agent",
        route: "/home",
        targets: ['[data-tour="agent-rail"]', '[data-tour="agent-status"]'],
        title: "Your agent, live",
        body: "Screening decisions and co-signs stream in here as they happen — approvals, reviews, and blocks in real time.",
        fallbackBody:
          "This pill is your agent's heartbeat — Watching means every signature gets screened before it executes.",
      },
      {
        id: "settings",
        targets: ['[data-tour="nav-settings"]'],
        title: "You're always in control",
        body: "Pause screening, manage your keys, or detach entirely — Zhentan Guard lives in Settings.",
      },
      {
        id: "done",
        brand: true,
        title: "You're guarded",
        body: "Your agent is watching. Make your first transfer whenever you're ready.",
      },
    ],
  };
}

/** Post-upgrade walkthrough for legacy (v1) accounts: settings only. */
export function upgradeTour(safeAddress: string): TourDefinition {
  return {
    key: "upgrade",
    finishLabel: "Got it",
    onClose: () => markTourSeen("upgrade", safeAddress),
    steps: [
      {
        id: "guard",
        route: "/settings",
        targets: ['[data-tour="guard-card"]'],
        title: "Your wallet has three keys now",
        body: "The agent still screens by default — but with your backup key on the account, you can pause screening or override any decision.",
      },
      {
        id: "wallet",
        route: "/settings",
        targets: ['[data-tour="wallet-card"]'],
        title: "Agent & key management live here",
        body: "Your owner set, the screening toggle, and the Safe app override are all managed from Settings — including Detach, if you ever want out.",
      },
    ],
  };
}
