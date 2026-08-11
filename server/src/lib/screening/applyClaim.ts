/**
 * Atomic application claim (D3 review): the decision write succeeds only if
 * the transaction is STILL eligible — no verdict yet, not executed, not
 * rejected/rejecting, screening on. One conditional UPDATE with a count
 * check (the D0 PostgREST lesson), so a rejection, execution, or screening
 * toggle that lands after the eligibility read can never be overwritten by
 * a late decision. Zero rows = the transaction moved on.
 */
import { supabase } from "../supabase/client.js";
import type { RiskResult } from "../../agent/index.js";

export async function claimScreeningApplication(
  txId: string,
  risk: RiskResult,
  /**
   * The tx version the decision was ACCEPTED against (job.tx_version).
   * Required: a policy edit or domain event that bumps the version between
   * result acceptance and this asynchronous write makes the decision stale
   * — the claim must lose, exactly as the submit RPC would have voided it.
   */
  expectedTxVersion: number
): Promise<boolean> {
  const patch: Record<string, unknown> = {
    risk_score: risk.riskScore,
    risk_verdict: risk.verdict,
    risk_reasons: risk.reasons,
    ...(risk.verdict !== "APPROVE" && {
      in_review: true,
      reviewed_at: new Date().toISOString(),
      review_reason: risk.reasons.join("; "),
    }),
  };
  const { count, error } = await supabase
    .from("transactions")
    .update(patch, { count: "exact" })
    .eq("id", txId)
    .eq("version", expectedTxVersion)
    .is("risk_verdict", null)
    .is("executed_at", null)
    .eq("rejected", false)
    .eq("screening_disabled", false)
    .or("rejection_status.is.null,rejection_status.eq.superseded");
  if (error) throw new Error(`Screening claim failed for ${txId}: ${error.message}`);
  return (count ?? 0) > 0;
}
