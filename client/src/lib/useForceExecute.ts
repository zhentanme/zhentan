"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Per-device toggle that enables the "force execute" send option (skip the
 * queue: take the current executable nonce, replacing whatever is pending
 * there). It's a UI capability gate only — execution still runs the normal
 * screening flow, so there's nothing to enforce server-side, which is why it
 * lives in localStorage rather than a synced setting. Keyed by Safe address.
 */
function storageKey(safeAddress: string | null | undefined): string | null {
  return safeAddress ? `force_execute_${safeAddress.toLowerCase()}` : null;
}

export function useForceExecuteSetting(safeAddress: string | null | undefined) {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    const key = storageKey(safeAddress);
    if (!key) {
      setEnabledState(false);
      return;
    }
    try {
      setEnabledState(localStorage.getItem(key) === "1");
    } catch {
      setEnabledState(false);
    }
  }, [safeAddress]);

  const setEnabled = useCallback(
    (value: boolean) => {
      setEnabledState(value);
      const key = storageKey(safeAddress);
      if (!key) return;
      try {
        if (value) localStorage.setItem(key, "1");
        else localStorage.removeItem(key);
      } catch {
        // storage unavailable — in-memory state still applies for this session
      }
    },
    [safeAddress]
  );

  return { enabled, setEnabled };
}
