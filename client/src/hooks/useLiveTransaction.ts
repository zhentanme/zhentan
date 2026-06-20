"use client";

import { useEffect, useState } from "react";
import { useApiClient } from "@/lib/api/client";
import type { TransactionWithStatus } from "@/types";

const TERMINAL = new Set(["executed", "rejected"]);
const LIVE_POLL_MS = 3_000;

/**
 * Polls a single transaction by id every 3s while it's non-terminal, so an open
 * detail view auto-reflects the pending → in_review → executed/rejected transition
 * (e.g. once the owner resolves it from Telegram). Stops on its own the moment the
 * tx reaches a terminal state, and when `id` goes null (dialog closed).
 *
 * Returns the freshest server record, or null before the first fetch — callers
 * should fall back to their own copy: `const view = live ?? tx`.
 */
export function useLiveTransaction(id: string | null): TransactionWithStatus | null {
  const api = useApiClient();
  const [data, setData] = useState<TransactionWithStatus | null>(null);

  useEffect(() => {
    // Drop any prior tx's data so callers fall back to their own copy while the
    // new id's first fetch is in flight (prevents showing stale cross-tx data).
    setData(null);
    if (!id) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const { transaction } = await api.transactions.get(id);
        if (cancelled) return;
        setData(transaction);
        if (!TERMINAL.has(transaction.status)) {
          timer = setTimeout(tick, LIVE_POLL_MS);
        }
      } catch {
        if (cancelled) return;
        timer = setTimeout(tick, LIVE_POLL_MS); // retry on transient error
      }
    };
    tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, api]);

  return data;
}
