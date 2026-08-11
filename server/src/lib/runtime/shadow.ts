/**
 * Shadow screening (D2) — the first runtime_jobs producer. The backend
 * screens inline and authoritatively exactly as before, and ADDITIONALLY
 * enqueues a shadow `screen` job carrying the same inputs (same snapshot,
 * same decoded calldata, same pinned evaluatedAt). The runtime evaluates
 * through the job protocol; the compare worker below logs agreement or
 * divergence into the job row and applies NOTHING. Divergence ~zero over a
 * representative window is the D3 cutover gate.
 */
import { supabase } from "../supabase/client.js";
import { enqueueJob, type RuntimeJobRow } from "./jobs.js";
import { encodeWireValue } from "./jobsPolicy.js";
import { compareScreenDecisions, type ShadowDecision } from "./shadowCompare.js";
import type { PendingTransaction } from "../../types.js";
import type { PatternsFile } from "../../agent/index.js";
import type { DecodedKind } from "../safe/kind.js";

/** Shadow enqueue rides the runtime deployment switch: without a token the
 *  worker can't exist, and jobs would pile up unleased forever. */
export function shadowScreeningEnabled(): boolean {
  return Boolean(process.env.RUNTIME_API_TOKEN);
}

/**
 * Fire-and-forget: a shadow enqueue failure must never affect the live
 * proposal flow. Inputs are wire-encoded (bigints in decoded calldata).
 */
export async function enqueueShadowScreen(
  tx: PendingTransaction,
  snapshot: PatternsFile,
  decoded: DecodedKind | undefined,
  evaluatedAt: Date,
  inlineDecision: ShadowDecision
): Promise<void> {
  if (!shadowScreeningEnabled()) return;
  try {
    const { data: row, error } = await supabase
      .from("transactions")
      .select("version")
      .eq("id", tx.id)
      .maybeSingle<{ version: number }>();
    if (error) throw new Error(error.message);
    await enqueueJob({
      kind: "screen",
      safeAddress: tx.safeAddress,
      txId: tx.id,
      txVersion: row?.version ?? 1,
      payload: {
        tx: encodeWireValue(tx) as Record<string, unknown>,
        snapshot: encodeWireValue(snapshot) as Record<string, unknown>,
        decoded: decoded === undefined ? undefined : (encodeWireValue(decoded) as Record<string, unknown>),
        evaluatedAt: evaluatedAt.toISOString(),
      },
      // Captured at enqueue — complete (incl. triggeredRules, which the
      // transactions table doesn't store) and immune to later mutations.
      inlineDecision,
    });
  } catch (err) {
    console.error(`Shadow screen enqueue failed for ${tx.id}:`, err instanceof Error ? err.message : err);
  }
}

interface ShadowResult {
  decision: ShadowDecision;
  evaluatedAt: string;
  shadowComparison?: unknown;
}

/**
 * Compare succeeded, not-yet-compared shadow results against the inline
 * decision persisted on the transaction. The comparison is written back
 * into the job's result jsonb (idempotence marker + queryable record);
 * divergences also log loudly. Returns counts for observability.
 */
export async function shadowComparePass(): Promise<{ compared: number; diverged: number }> {
  const { data: jobs, error } = await supabase
    .from("runtime_jobs")
    .select("*")
    .eq("kind", "screen")
    .eq("status", "succeeded")
    .is("result->shadowComparison", null)
    .order("updated_at", { ascending: true })
    .limit(50)
    .returns<RuntimeJobRow[]>();
  if (error) throw new Error(`Shadow compare query failed: ${error.message}`);

  let compared = 0;
  let diverged = 0;
  for (const job of jobs ?? []) {
    const result = job.result as ShadowResult | null;
    if (!result?.decision) continue;

    // Prefer the complete decision captured at enqueue (incl. triggered
    // rules). Fallback to the transaction row only for pre-capture jobs.
    let inline: import("./shadowCompare.js").InlineDecision | null = null;
    const captured = job.inline_decision as ShadowDecision | null;
    if (captured) {
      inline = {
        riskScore: captured.riskScore,
        riskVerdict: captured.verdict,
        riskReasons: captured.reasons,
        triggeredRules: captured.triggeredRules ?? [],
      };
    } else {
      const { data: tx, error: txError } = await supabase
        .from("transactions")
        .select("risk_score, risk_verdict, risk_reasons")
        .eq("id", job.tx_id)
        .maybeSingle<{ risk_score: number | null; risk_verdict: string | null; risk_reasons: string[] | null }>();
      if (txError) {
        console.error(`Shadow compare tx fetch failed for ${job.tx_id}:`, txError.message);
        continue;
      }
      inline = tx
        ? { riskScore: tx.risk_score, riskVerdict: tx.risk_verdict, riskReasons: tx.risk_reasons, triggeredRules: null }
        : null;
    }
    const comparison = inline
      ? compareScreenDecisions(inline, result.decision)
      : { agree: false, causes: ["no inline decision available for comparison"] };

    const { error: writeError } = await supabase
      .from("runtime_jobs")
      .update({
        result: { ...result, shadowComparison: { ...comparison, comparedAt: new Date().toISOString() } },
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "succeeded");
    if (writeError) {
      console.error(`Shadow comparison write failed for job ${job.id}:`, writeError.message);
      continue;
    }
    compared++;
    if (!comparison.agree) {
      diverged++;
      console.warn(
        `SHADOW DIVERGENCE tx=${job.tx_id} job=${job.id}: ${comparison.causes.join(" | ")}`
      );
    }
  }
  return { compared, diverged };
}

const COMPARE_INTERVAL_MS = 60 * 1000;

/** Interval worker — same pattern as safeSync. No-op when shadow is off. */
export function startShadowCompareWorker(): void {
  if (!shadowScreeningEnabled()) {
    console.log("Shadow screening off (RUNTIME_API_TOKEN unset) — compare worker not started");
    return;
  }
  setInterval(() => {
    shadowComparePass().catch((err) =>
      console.error("Shadow compare pass failed:", err instanceof Error ? err.message : err)
    );
  }, COMPARE_INTERVAL_MS).unref();
  console.log(`Shadow compare worker up (every ${COMPARE_INTERVAL_MS / 1000}s)`);
}
