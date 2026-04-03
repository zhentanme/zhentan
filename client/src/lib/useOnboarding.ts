"use client";

import { useState, useEffect } from "react";
import { useApiClient } from "@/lib/api/client";

// ── Storage schema ────────────────────────────────────────────────────────────
// Minimal — localStorage is only a fast-path cache. Source of truth is the backend.

interface StoredState {
  /** Current step: 0 = username, 1 = telegram, 2 = done */
  step: number;
  /** Cached once confirmed by backend — avoids a round-trip on the same device */
  completed: boolean;
}

const DEFAULT: StoredState = { step: 0, completed: false };

function storageKey(safeAddress: string) {
  return `onboarding_${safeAddress}`;
}

function readStored(safeAddress: string): StoredState {
  try {
    const raw = localStorage.getItem(storageKey(safeAddress));
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : { ...DEFAULT };
  } catch {
    return { ...DEFAULT };
  }
}

function patchStored(safeAddress: string, patch: Partial<StoredState>): StoredState {
  try {
    const next = { ...readStored(safeAddress), ...patch };
    localStorage.setItem(storageKey(safeAddress), JSON.stringify(next));
    return next;
  } catch {
    return { ...DEFAULT, ...patch };
  }
}

// ── Write helpers (used by onboarding page) ───────────────────────────────────

/** Username skipped → persist step 1 */
export function markOnboardingUsernameSkipped(safeAddress: string) {
  patchStored(safeAddress, { step: 1 });
}

/** Username saved → persist step 1 */
export function markOnboardingUsernameSet(safeAddress: string) {
  patchStored(safeAddress, { step: 1 });
}

/** Telegram done or skipped → Done step reached, cache completed locally */
export function markOnboardingTelegramDone(safeAddress: string) {
  patchStored(safeAddress, { step: 2, completed: true });
}

/** Skip setup → Done step, cache completed locally */
export function markAllOnboardingSkipped(safeAddress: string) {
  patchStored(safeAddress, { step: 2, completed: true });
}

// ── Hook (used by OnboardingGuard) ────────────────────────────────────────────

export interface OnboardingStatus {
  loading: boolean;
  complete: boolean;
}

export function useOnboarding(
  safeAddress: string | null,
  telegramUserId?: string
): OnboardingStatus {
  const api = useApiClient();
  const [loading, setLoading] = useState(true);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!safeAddress) return;

    const s = readStored(safeAddress);

    // Fast path: already confirmed on this device
    if (s.completed) {
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
          patchStored(safeAddress, { completed: true });
          setComplete(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeAddress]);

  return { loading, complete };
}
