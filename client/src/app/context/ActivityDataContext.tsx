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
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
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
 *
 * Updates are poll-driven but adaptive: polling speeds up while anything is
 * awaiting resolution (a queued request or an in-review tx) so the pending →
 * executed/rejected transition lands within seconds, and backs off to a slow
 * cadence when idle. A focused tab also refetches immediately (see
 * {@link useAutoRefresh}). New proposals can be inserted optimistically so they
 * appear instantly, then reconcile against the server record by id.
 */
interface ActivityDataContextType {
  /** All queued/processed requests (invoices, payment asks). */
  requests: QueuedRequest[];
  /** Zhentan DB transaction records (no Zerion enrichment), newest first. */
  transactions: TransactionWithStatus[];
  /** Requests still awaiting the user (status === "queued"). */
  queuedCount: number;
  /** True until the first fetch resolves — consumers show skeletons, not empty states. */
  loading: boolean;
  /** Force an immediate refetch (e.g. after approve/reject). */
  refresh: () => Promise<void>;
  /**
   * Insert a just-proposed tx so it shows immediately, before the next poll.
   * Dropped automatically once the server returns a record with the same id.
   */
  addOptimisticTransaction: (tx: TransactionWithStatus) => void;
}

const ActivityDataContext = createContext<ActivityDataContextType | null>(null);

/** Idle cadence — nothing awaiting resolution. */
const POLL_MS = 30_000;
/** Active cadence — a request or tx is mid-flight; resolve the transition fast. */
const FAST_POLL_MS = 8_000;

function isActiveTx(t: TransactionWithStatus): boolean {
  return (
    t.status === "pending" ||
    t.status === "in_review" ||
    t.status === "confirming"
  );
}

export function ActivityDataProvider({ children }: { children: ReactNode }) {
  const api = useApiClient();
  const { safeAddress } = useAuth();
  const [requests, setRequests] = useState<QueuedRequest[]>([]);
  const [serverTxns, setServerTxns] = useState<TransactionWithStatus[]>([]);
  const [optimistic, setOptimistic] = useState<TransactionWithStatus[]>([]);
  const [loading, setLoading] = useState(true);

  // Background-safe refetch — never toggles `loading`, so polls don't flash skeletons.
  const refresh = useCallback(async () => {
    if (!safeAddress) {
      setRequests([]);
      setServerTxns([]);
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
      setServerTxns(txResult.value.transactions || []);
    }
  }, [api, safeAddress]);

  // Initial load (and reload on Safe change) — this is the only path that shows loading.
  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // Merge optimistic proposals ahead of server records; the server copy wins by id.
  const transactions = useMemo(() => {
    const serverIds = new Set(serverTxns.map((t) => t.id));
    const extras = optimistic.filter((o) => !serverIds.has(o.id));
    return [...extras, ...serverTxns].sort(
      (a, b) => new Date(b.proposedAt).getTime() - new Date(a.proposedAt).getTime()
    );
  }, [serverTxns, optimistic]);

  // Once the server knows about an optimistic tx, drop the local copy.
  useEffect(() => {
    if (optimistic.length === 0) return;
    const serverIds = new Set(serverTxns.map((t) => t.id));
    if (optimistic.some((o) => serverIds.has(o.id))) {
      setOptimistic((prev) => prev.filter((o) => !serverIds.has(o.id)));
    }
  }, [serverTxns, optimistic]);

  const addOptimisticTransaction = useCallback(
    (tx: TransactionWithStatus) => {
      setOptimistic((prev) => [tx, ...prev.filter((p) => p.id !== tx.id)]);
      refresh(); // kick a fetch so the real record arrives ASAP
    },
    [refresh]
  );

  // Speed up while anything awaits resolution; idle otherwise.
  const hasActive = useMemo(
    () =>
      transactions.some(isActiveTx) ||
      requests.some((r) => r.status === "queued"),
    [transactions, requests]
  );
  useAutoRefresh(refresh, hasActive ? FAST_POLL_MS : POLL_MS);

  const queuedCount = useMemo(
    () => requests.filter((r) => r.status === "queued").length,
    [requests]
  );

  const value = useMemo(
    () => ({
      requests,
      transactions,
      queuedCount,
      loading,
      refresh,
      addOptimisticTransaction,
    }),
    [requests, transactions, queuedCount, loading, refresh, addOptimisticTransaction]
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
