"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useApiClient } from "@/lib/api/client";
import { useAuth } from "./AuthContext";
import type { QueuedRequest, TransactionWithStatus } from "@/types";

/**
 * Single source of truth for queued requests + Zhentan transaction records.
 *
 * Previously the right rail, sidebar, top bar and requests page each fetched
 * `/requests` (and the rail also `/transactions`) on their own 30s timers — up
 * to four redundant `/requests` hits per cycle, plus the rail blocking on the
 * slow Zerion-merged `/transactions` endpoint. This provider fetches both
 * sources once, in parallel, off the cheap `/transactions/db` endpoint, and
 * hands the result to every consumer.
 */
interface ActivityDataContextType {
  /** All queued/processed requests (invoices, payment asks). */
  requests: QueuedRequest[];
  /** Zhentan DB transaction records (no Zerion enrichment). */
  transactions: TransactionWithStatus[];
  /** Requests still awaiting the user (status === "queued"). */
  queuedCount: number;
  /** True until the first fetch resolves — consumers show skeletons, not empty states. */
  loading: boolean;
  /** Force an immediate refetch (e.g. after approve/reject). */
  refresh: () => Promise<void>;
}

const ActivityDataContext = createContext<ActivityDataContextType | null>(null);

const POLL_MS = 30_000;

export function ActivityDataProvider({ children }: { children: ReactNode }) {
  const api = useApiClient();
  const { safeAddress } = useAuth();
  const [requests, setRequests] = useState<QueuedRequest[]>([]);
  const [transactions, setTransactions] = useState<TransactionWithStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Both sources require an authenticated Safe; skip on public pages.
    if (!safeAddress) {
      setRequests([]);
      setTransactions([]);
      setLoading(false);
      return;
    }
    const [reqResult, txResult] = await Promise.allSettled([
      api.requests.list(),
      api.transactions.listDb(safeAddress),
    ]);
    if (reqResult.status === "fulfilled") {
      setRequests(reqResult.value.requests || []);
    }
    if (txResult.status === "fulfilled") {
      setTransactions(txResult.value.transactions || []);
    }
    setLoading(false);
  }, [api, safeAddress]);

  useEffect(() => {
    setLoading(true);
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const queuedCount = useMemo(
    () => requests.filter((r) => r.status === "queued").length,
    [requests]
  );

  const value = useMemo(
    () => ({ requests, transactions, queuedCount, loading, refresh }),
    [requests, transactions, queuedCount, loading, refresh]
  );

  return (
    <ActivityDataContext.Provider value={value}>
      {children}
    </ActivityDataContext.Provider>
  );
}

export function useActivityData() {
  const ctx = useContext(ActivityDataContext);
  if (!ctx) {
    throw new Error("useActivityData must be used within ActivityDataProvider");
  }
  return ctx;
}
