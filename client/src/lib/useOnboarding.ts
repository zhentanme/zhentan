"use client";

import { useState, useEffect } from "react";
import { useApiClient } from "@/lib/api/client";

// ── Cookie helpers (read by Next.js middleware for server-side routing) ───────

function setOnboardingCompleteCookie() {
  if (typeof document === "undefined") return;
  document.cookie = "onboarding_complete=1; path=/; max-age=31536000; samesite=lax";
}

export function clearOnboardingCompleteCookie() {
  if (typeof document === "undefined") return;
  document.cookie = "onboarding_complete=; path=/; max-age=0; samesite=lax";
}

// ── Storage schema ────────────────────────────────────────────────────────────
// Minimal — localStorage is only a fast-path cache. Source of truth is the backend.
//
// Keyed by the EMBEDDED WALLET address, not the Safe address: a new user's
// Safe address doesn't exist until they link their backup key (owner #2)
// during onboarding, but progress must persist from step 0.

interface StoredState {
  /** Current step: 0 = backup key, 1 = username, 2 = telegram, 3 = done */
  step: number;
  /** Cached once confirmed by backend — avoids a round-trip on the same device */
  completed: boolean;
}

const DEFAULT: StoredState = { step: 0, completed: false };

function storageKey(walletAddress: string) {
  return `onboarding_${walletAddress}`;
}

function readStored(walletAddress: string): StoredState {
  try {
    const raw = localStorage.getItem(storageKey(walletAddress));
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : { ...DEFAULT };
  } catch {
    return { ...DEFAULT };
  }
}

function patchStored(walletAddress: string, patch: Partial<StoredState>): StoredState {
  try {
    const next = { ...readStored(walletAddress), ...patch };
    localStorage.setItem(storageKey(walletAddress), JSON.stringify(next));
    return next;
  } catch {
    return { ...DEFAULT, ...patch };
  }
}

// ── Write helpers (used by onboarding page) ───────────────────────────────────

/** Backup key linked → persist step 1 */
export function markOnboardingWalletLinked(walletAddress: string) {
  patchStored(walletAddress, { step: 1 });
}

/** Username skipped → persist step 2 */
export function markOnboardingUsernameSkipped(walletAddress: string) {
  patchStored(walletAddress, { step: 2 });
}

/** Username saved → persist step 2 */
export function markOnboardingUsernameSet(walletAddress: string) {
  patchStored(walletAddress, { step: 2 });
}

/** Telegram done or skipped → Done step reached, cache completed locally */
export function markOnboardingTelegramDone(walletAddress: string) {
  patchStored(walletAddress, { step: 3, completed: true });
  setOnboardingCompleteCookie();
}

/** Skip setup → Done step, cache completed locally */
export function markAllOnboardingSkipped(walletAddress: string) {
  patchStored(walletAddress, { step: 3, completed: true });
  setOnboardingCompleteCookie();
}

/** Restore the persisted step for this device (0 when nothing stored). */
export function readOnboardingStep(walletAddress: string): number {
  const s = readStored(walletAddress).step;
  return typeof s === "number" && s >= 0 && s <= 3 ? s : 0;
}

// ── Hook (used by AuthGuard / login page) ─────────────────────────────────────

export interface OnboardingStatus {
  loading: boolean;
  complete: boolean;
}

/**
 * Resolves whether onboarding is complete.
 *
 * `ready` gates the check until auth + Safe resolution have settled. A ready
 * session with NO safeAddress is a new user who hasn't linked their backup
 * key yet — always incomplete (the Safe address cannot exist without owner #2).
 */
export function useOnboarding(
  {
    walletAddress,
    safeAddress,
    ready,
  }: {
    walletAddress: string | null | undefined;
    safeAddress: string | null;
    ready: boolean;
  },
  telegramUserId?: string
): OnboardingStatus {
  const api = useApiClient();
  const [loading, setLoading] = useState(true);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!ready || !walletAddress) return;

    // New user without a Safe yet → onboarding needed, nothing to fetch.
    if (!safeAddress) {
      setComplete(false);
      setLoading(false);
      return;
    }

    const s = readStored(walletAddress);

    // Fast path: already confirmed on this device.
    // Re-assert the cookie — it may have been cleared on logout while localStorage persisted.
    if (s.completed) {
      setOnboardingCompleteCookie();
      setComplete(true);
      setLoading(false);
      return;
    }

    // Fetch from backend — handles new devices and returning users
    api.users
      .get(safeAddress)
      .then((data) => {
        const backendCompleted = data?.onboarding_completed === true;
        // Also auto-complete if user already has both username + telegram set
        // (e.g. set up outside of onboarding, or migrated from before this feature)
        const naturallyComplete = !!data?.username && !!telegramUserId;

        if (backendCompleted || naturallyComplete) {
          patchStored(walletAddress, { completed: true });
          setOnboardingCompleteCookie();
          setComplete(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, walletAddress, safeAddress]);

  return { loading, complete };
}
