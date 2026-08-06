/**
 * Tier 1 of the agent domain: PURE EVALUATION. This file must never import
 * persistence, notification, or execution machinery — it is loadable (and
 * testable) with zero environment. Purity here is what makes D2 shadow
 * screening and deterministic replay possible.
 *
 * One honest caveat: time-of-day scoring reads the clock, so evaluation is
 * pure given (inputs, clock). The timestamp becomes an explicit job input
 * at D0.2, where result input-hashes need it pinned.
 */
import { analyzeRisk, type RiskResult, type PatternsFile } from "../risk.js";
import type { PendingTransaction } from "../types.js";
import type { DecodedKind } from "../lib/safe/kind.js";

/**
 * Screen a LIVE transaction — `decoded` comes from its SIGNED calldata, so
 * swaps/approvals are scored by their own strategy instead of as a
 * "transfer to the router".
 */
export function evaluateTransaction(
  tx: PendingTransaction,
  snapshot: PatternsFile,
  decoded?: DecodedKind
): RiskResult {
  return analyzeRisk(tx, snapshot, decoded);
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
  syntheticDecoded?: DecodedKind
): RiskResult {
  return analyzeRisk(tx, snapshot, syntheticDecoded);
}

export type { RiskResult, PatternsFile };
