/**
 * Reconciliation worker for the SafeTx flow.
 *
 * A pending SafeTx can be resolved outside Zhentan — the user confirms with
 * their backup key and executes from app.safe.global (the override path), or
 * a different tx consumes the nonce. This worker polls the Transaction
 * Service for every unresolved safetx row and folds the outcome back into
 * Zhentan's DB so history, patterns and notifications stay truthful.
 */
import { supabase } from "../lib/supabase/client.js";
import type { TransactionRow } from "../lib/supabase/types.js";
import { rowToTx } from "../lib/supabase/index.js";
import { reconcileSafeTx } from "../lib/safe/reconcile.js";
import { resumeRejection } from "../lib/safe/reject.js";

const SYNC_INTERVAL_MS = 60_000;

// Age-based backoff: a row unresolved for over a day (an abandoned queued
// tx, a wallet whose agent never ran) is checked hourly instead of every
// tick. Without this, every stale row costs one Safe-service call per
// minute forever — a week-old orphan alone burns ~10k requests of the API
// rate budget.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const STALE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const nextStaleCheckAt = new Map<string, number>();

async function getUnresolvedSafeTxRows(): Promise<TransactionRow[]> {
  // Rows with an ACTIVE rejection are excluded — reconciliation would
  // misread the landed cancel as "superseded by a different tx". The
  // rejection pass below owns them until they confirm or degrade to
  // `superseded`, at which point they reappear here for folding.
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("tx_type", "safetx")
    .eq("rejected", false)
    .is("executed_at", null)
    .not("safe_tx_hash", "is", null)
    .or("rejection_status.is.null,rejection_status.eq.superseded")
    .returns<TransactionRow[]>();
  if (error) throw error;
  return data ?? [];
}

/** Rejections a crash or failure left mid-flight (B4 durable job). */
async function getInFlightRejectionRows(): Promise<TransactionRow[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("tx_type", "safetx")
    .eq("rejected", false)
    .is("executed_at", null)
    .in("rejection_status", ["requested", "cancel_signing", "cancel_submitted", "failed_retryable"])
    .returns<TransactionRow[]>();
  if (error) throw error;
  return data ?? [];
}

async function syncOne(row: TransactionRow): Promise<void> {
  const outcome = await reconcileSafeTx(rowToTx(row));
  if (outcome.status === "executed") {
    console.log(`safeSync: ${row.id} executed externally (${outcome.txHash})`);
  } else if (outcome.status === "superseded") {
    console.log(`safeSync: ${row.id} superseded at nonce ${row.safe_nonce}`);
  }
}

async function rejectionPass(): Promise<void> {
  let rows: TransactionRow[];
  try {
    rows = await getInFlightRejectionRows();
  } catch (err) {
    console.error("safeSync: failed to list in-flight rejections:", err);
    return;
  }
  for (const row of rows) {
    try {
      const result = await resumeRejection(rowToTx(row));
      if (result) {
        console.log(
          `safeSync: rejection ${row.id}: ${result.status}${result.txHash ? ` (${result.txHash})` : ""}${result.reason ? ` — ${result.reason}` : ""}`
        );
      }
    } catch (err) {
      console.error(`safeSync: rejection resume failed for ${row.id}:`, err);
    }
  }
}

async function tick(): Promise<void> {
  let rows: TransactionRow[];
  try {
    rows = await getUnresolvedSafeTxRows();
  } catch (err) {
    console.error("safeSync: failed to list unresolved rows:", err);
    return;
  }
  // Prune backoff entries for rows that resolved since the last tick.
  const liveIds = new Set(rows.map((r) => r.id));
  for (const id of nextStaleCheckAt.keys()) {
    if (!liveIds.has(id)) nextStaleCheckAt.delete(id);
  }
  for (const row of rows) {
    const age = Date.now() - new Date(row.proposed_at).getTime();
    if (Number.isFinite(age) && age > STALE_AFTER_MS) {
      if (Date.now() < (nextStaleCheckAt.get(row.id) ?? 0)) continue;
      nextStaleCheckAt.set(row.id, Date.now() + STALE_CHECK_INTERVAL_MS);
    }
    try {
      await syncOne(row);
    } catch (err) {
      console.error(`safeSync: failed to sync ${row.id}:`, err);
    }
  }
  await rejectionPass();
}

export function startSafeSyncWorker(): void {
  // Skip entirely when the SafeTx flow isn't configured.
  if (!process.env.SAFE_API_KEY && !process.env.SAFE_TX_SERVICE_URL) {
    console.log("safeSync: SAFE_API_KEY not set — worker disabled");
    return;
  }
  setInterval(() => void tick(), SYNC_INTERVAL_MS);
  console.log(`safeSync: reconciliation worker started (${SYNC_INTERVAL_MS / 1000}s)`);
}
