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

/**
 * Remove every per-wallet onboarding fast-path entry — logout hygiene. The
 * backend record (`onboarding_completed`) rebuilds this on the next login, so
 * nothing durable is lost.
 */
export function clearOnboardingStorage() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith("onboarding_")) localStorage.removeItem(key);
    }
  } catch {
    // storage unavailable — nothing to clear
  }
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
    recordOnboardingCompleted,
  }: {
    walletAddress: string | null | undefined;
    safeAddress: string | null;
    ready: boolean;
    /**
     * Authoritative onboarding flag from the backend user record, already
     * fetched by useSafeAddress to resolve the address. `null` while the
     * record is still loading or for brand-new users with no record yet.
     */
    recordOnboardingCompleted: boolean | null;
  },
  telegramUserId?: string
): OnboardingStatus {
  const api = useApiClient();
  const [loading, setLoading] = useState(true);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!ready || !walletAddress) return;

    // The backend record is the source of truth — it came back with the Safe
    // address resolution, so no second round-trip and no localStorage-key
    // dependency. Cache the result locally + set the cookie for the middleware
    // fast path.
    if (recordOnboardingCompleted === true) {
      patchStored(walletAddress, { completed: true, step: 3 });
      setOnboardingCompleteCookie();
      setComplete(true);
      setLoading(false);
      return;
    }

    // Device already finished onboarding — trust it regardless of whether the
    // Safe address resolved this render. Checked BEFORE the no-Safe bailout so
    // a transient record-lookup miss can never bounce a completed user back
    // into onboarding. (Only markOnboarding*Done / the backend paths ever set
    // completed:true, so this is a strong signal.)
    const s = readStored(walletAddress);
    if (s.completed) {
      setOnboardingCompleteCookie();
      setComplete(true);
      setLoading(false);
      return;
    }

    // New user without a Safe yet → onboarding needed, nothing to fetch.
    if (!safeAddress) {
      setComplete(false);
      setLoading(false);
      return;
    }

    // Fallback: the record hasn't loaded yet (recordOnboardingCompleted null)
    // but a backend record may still exist — e.g. username+telegram set
    // outside onboarding. One best-effort fetch; a failure leaves the user in
    // onboarding, which is the safe default for a genuinely new account.
    api.users
      .get(safeAddress)
      .then((data) => {
        const backendCompleted = data?.onboarding_completed === true;
        const naturallyComplete = !!data?.username && !!telegramUserId;
        if (backendCompleted || naturallyComplete) {
          patchStored(walletAddress, { completed: true, step: 3 });
          setOnboardingCompleteCookie();
          setComplete(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, walletAddress, safeAddress, recordOnboardingCompleted]);

  return { loading, complete };
}
