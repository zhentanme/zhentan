/**
 * Tier 1 of the agent domain: PURE EVALUATION. The implementation moved to
 * the shared zhentan-screening package at D1 — the runtime worker evaluates
 * with the SAME code, which is what makes D2 shadow screening
 * bit-comparable. This shim keeps the frozen C1 surface (agent/index.ts)
 * unchanged; the purity property now holds by package construction
 * (zhentan-screening is dependency-free and env-free, lint-enforced).
 */
export {
  evaluateTransaction,
  evaluateRequest,
  type RiskResult,
  type PatternsFile,
} from "zhentan-screening/evaluate";
