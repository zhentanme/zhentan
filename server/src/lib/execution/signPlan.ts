/**
 * Which sign-job purpose an execution requests — pure rule, contract-tested.
 *
 * Ordinary proposals were screened by the runtime, so execution uses the
 * strict `execution` purpose: the runtime refuses without ITS OWN screening
 * record for the exact content.
 *
 * Agent-drafted request transactions (queue_request → draft → the user signs
 * in the app) are different by design: they are screened INLINE by the
 * server's rules engine (pre-Intent-Proposer), so the runtime never holds a
 * screening record for them — the `execution` purpose would refuse forever
 * ("no local screening record"). Their signing rule is the DRAFT one the
 * runtime already implements: it endorses its own draft against
 * version-pinned user-approval evidence — the same rule (and, the signature
 * being deterministic, the same bytes) as the 1/2 service-mirror signature
 * produced at finalization. This adds no trust the draft path hadn't already
 * conceded: user approval is a backend assertion under P6–P8 either way.
 *
 * The draft birthmark is server-derived, never claimed by a caller: the
 * request linkage (requests.tx_id — written only by the agent-queue flow)
 * plus the user's stored signature (the approval that finalized it). A
 * linked-but-unsigned draft falls through to the strict purpose and is
 * refused — fail closed.
 */
import type { SignPurpose } from "zhentan-screening/protocol";

export interface ExecutionSignPlan {
  purpose: SignPurpose;
  userApproved: boolean;
}

export function executionSignPlan(tx: {
  riskVerdict?: string;
  userSignature?: string;
}, hasLinkedRequest: boolean): ExecutionSignPlan {
  if (hasLinkedRequest && Boolean(tx.userSignature)) {
    return { purpose: "draft_finalization", userApproved: true };
  }
  return {
    purpose: "execution",
    // A REVIEW/BLOCK verdict reaching execution means the user approved it
    // (the review gate is the only path here); the runtime demands that
    // evidence.
    userApproved: tx.riskVerdict === "REVIEW" || tx.riskVerdict === "BLOCK",
  };
}
