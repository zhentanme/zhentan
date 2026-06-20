"use client";

import { useEffect, useRef } from "react";

/**
 * Attaches interval polling + tab-visibility refetch to any refetch function.
 * The callback is held in a ref, so passing a fresh closure each render is fine —
 * only `intervalMs` changes re-subscribe the timer. Refetches immediately when the
 * tab regains visibility, so returning to a backgrounded tab shows fresh data at once.
 *
 * @param refetch     Refetch callback (no need to memoize).
 * @param intervalMs  Poll interval in ms (default 30s). Pass a smaller value to poll
 *                    faster while something is in flight, larger when idle.
 */
export function useAutoRefresh(refetch: () => void, intervalMs = 30_000) {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    const tick = () => refetchRef.current();
    const id = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
}
