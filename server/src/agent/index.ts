/**
 * THE AGENT DOMAIN (P5/C1) — everything the future runtime owns, behind one
 * explicit interface. This module's surface is, verbatim, the job-payload
 * surface of the process split (D-milestone): screening evaluation, policy
 * snapshots, learning, rules/limits/settings, the event log, and the signing
 * authority.
 *
 * Three tiers, deliberately separated:
 *
 *   Tier 1 — PURE EVALUATION. Same inputs, same decision, no I/O. This is
 *            what makes shadow screening (D2) and deterministic replay
 *            possible.
 *   Tier 2 — EXPLICIT PERSISTENCE. Policy reads and learning writes are
 *            side effects and say so in their names. Never implicit in
 *            evaluation.
 *   Tier 3 — DOES NOT EXIST HERE. Notifications and execution are the
 *            caller's job: the route consumes a decision and does the
 *            notifying/executing. Nothing in this module may import
 *            notify/telegram/execution machinery.
 *
 * Routes and workers must reach agent-domain functionality ONLY through
 * this module (enforced by lint from C2).
 */
// ── Tier 1: pure evaluation (physically separated — evaluate.ts loads with
//    zero environment; see its module doc) ──────────────────────────────────

export {
  evaluateTransaction,
  evaluateRequest,
  type RiskResult,
  type PatternsFile,
} from "./evaluate.js";

// ── Deep analysis (Tier 2 — external scanners; I/O by nature) ───────────────

export { deepAnalyze } from "./analysis.js";

// ── Tier 2: explicit persistence — policy reads ─────────────────────────────

export {
  /** Immutable policy/pattern snapshot for evaluation (versioned at E3). */
  getPatternsForSafe as loadPolicySnapshot,
  getUserRules,
  getUserRule,
  createUserRule,
  updateUserRule,
  deleteUserRule,
  getUserSettings,
  upsertUserSettings,
  getGlobalLimits,
  upsertGlobalLimits,
  getRecipientProfile,
  getBehavioralEvents,
} from "../lib/supabase/db.js";

// ── Tier 2: explicit persistence — learning writes ──────────────────────────

export {
  /** Record a screening outcome + behavioral event. A side effect, named as one. */
  recordTxOutcome as recordOutcome,
  /** Learn recipient/velocity/token/time patterns from an executed tx. */
  updatePatternsAfterExecution as learnFromExecution,
  incrementDailyStatsReview as noteReviewOutcome,
  recordBehavioralEvent as recordEvent,
} from "../lib/supabase/db.js";

// ── Signing authority (A2) — verified requests only; KeySigner stays private ─

export {
  getSigningAuthority,
  type SafeSigningRequest,
  type SigningResult,
  type SigningPurpose,
  type DecisionEvidence,
} from "../lib/agent/signer.js";
