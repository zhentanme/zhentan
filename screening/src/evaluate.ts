/**
 * PURE EVALUATION — the C1 Tier 1 surface, extracted so backend and runtime
 * share one implementation. This module must never import persistence,
 * notification, or execution machinery — it is loadable (and testable) with
 * zero environment. Purity here is what makes D2 shadow screening
 * bit-comparable across processes and deterministic replay possible.
 *
 * The evaluation timestamp is an EXPLICIT input (time-of-day scoring uses
 * it), so identical payloads replay to identical decisions across any
 * boundary — the job payload carries it.
 */
import { analyzeRisk, type RiskResult, type PatternsFile } from "./risk.js";
import type { PendingTransaction } from "./types.js";
import type { DecodedKind } from "./decoded.js";

/**
 * Screen a LIVE transaction — `decoded` comes from its SIGNED calldata, so
 * swaps/approvals are scored by their own strategy instead of as a
 * "transfer to the router".
 */
export function evaluateTransaction(
  tx: PendingTransaction,
  snapshot: PatternsFile,
  decoded?: DecodedKind,
  evaluatedAt: Date = new Date()
): RiskResult {
  return analyzeRisk(tx, snapshot, decoded, evaluatedAt);
}

/**
 * Screen an agent-queued REQUEST — no calldata exists yet, so the caller
 * passes a SYNTHETIC decoded shape that zeroes the swap/approval factors.
 * Deliberately a distinct named method: the two input shapes are a design
 * decision, not caller folklore. (Retired for plan-backed requests when the
 * Intent Proposer schema lands — a prepared plan has real calldata.)
 */
export function evaluateRequest(
  tx: PendingTransaction,
  snapshot: PatternsFile,
  syntheticDecoded?: DecodedKind,
  evaluatedAt: Date = new Date()
): RiskResult {
  return analyzeRisk(tx, snapshot, syntheticDecoded, evaluatedAt);
}

export type { RiskResult, PatternsFile };
