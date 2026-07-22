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

const SYNC_INTERVAL_MS = 60_000;

async function getUnresolvedSafeTxRows(): Promise<TransactionRow[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("tx_type", "safetx")
    .eq("rejected", false)
    .is("executed_at", null)
    .not("safe_tx_hash", "is", null)
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

async function tick(): Promise<void> {
  let rows: TransactionRow[];
  try {
    rows = await getUnresolvedSafeTxRows();
  } catch (err) {
    console.error("safeSync: failed to list unresolved rows:", err);
    return;
  }
  for (const row of rows) {
    try {
      await syncOne(row);
    } catch (err) {
      console.error(`safeSync: failed to sync ${row.id}:`, err);
    }
  }
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
