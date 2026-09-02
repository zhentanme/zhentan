/**
 * policy_change_proposals data access (#144 Phase 1).
 *
 * Lifecycle: pending → confirmed | rejected | expired. Resolution is an
 * ATOMIC conditional transition — the UPDATE carries `status = 'pending'`
 * in its WHERE, so a concurrent confirm + reject can never both act; the
 * loser simply matches zero rows. Expiry is lazy: stale pendings are
 * flipped on read/claim, never by a timer, and an expired proposal can
 * never be confirmed (the claim also requires `expires_at > now()`).
 */
import { supabase } from "./client.js";
import type { LimitsPatch } from "../screening/limits.js";

export interface PolicyChangeProposalRow {
  id: string;
  safe_address: string;
  patch: LimitsPatch;
  proposed_via: "client" | "agent";
  status: "pending" | "confirmed" | "rejected" | "expired";
  expires_at: string;
  confirmed_via: string | null;
  reject_reason: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** Flip stale pendings to expired. Call before any read or claim. */
export async function expireStaleProposals(safeAddress: string): Promise<void> {
  const { error } = await supabase
    .from("policy_change_proposals")
    .update({ status: "expired", resolved_at: new Date().toISOString() })
    .eq("safe_address", safeAddress.toLowerCase())
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
  if (error) throw error;
}

export async function getPendingProposal(
  safeAddress: string
): Promise<PolicyChangeProposalRow | null> {
  const { data, error } = await supabase
    .from("policy_change_proposals")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .eq("status", "pending")
    .maybeSingle<PolicyChangeProposalRow>();
  if (error) throw error;
  return data ?? null;
}

export async function getProposal(id: string): Promise<PolicyChangeProposalRow | null> {
  const { data, error } = await supabase
    .from("policy_change_proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle<PolicyChangeProposalRow>();
  if (error) throw error;
  return data ?? null;
}

/**
 * Creates a pending proposal. Returns null when one is already pending for
 * this Safe (the partial unique index answers with 23505) — callers map
 * that to a 409.
 */
export async function createProposal(
  safeAddress: string,
  patch: LimitsPatch,
  proposedVia: "client" | "agent",
  ttlMs: number
): Promise<PolicyChangeProposalRow | null> {
  const { data, error } = await supabase
    .from("policy_change_proposals")
    .insert({
      safe_address: safeAddress.toLowerCase(),
      patch,
      proposed_via: proposedVia,
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    })
    .select()
    .single<PolicyChangeProposalRow>();
  if (error) {
    if (error.code === "23505") return null;
    throw error;
  }
  return data;
}

/**
 * Atomically rejects a pending proposal. Returns the claimed row, or null
 * when the proposal is not pending anymore (resolved concurrently) or has
 * expired.
 */
export async function claimProposalRejected(
  id: string,
  safeAddress: string,
  rejectReason: string
): Promise<PolicyChangeProposalRow | null> {
  const { data, error } = await supabase
    .from("policy_change_proposals")
    .update({
      status: "rejected",
      resolved_at: new Date().toISOString(),
      reject_reason: rejectReason,
    })
    .eq("id", id)
    .eq("safe_address", safeAddress.toLowerCase())
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select()
    .maybeSingle<PolicyChangeProposalRow>();
  if (error) throw error;
  return data ?? null;
}

export type ApplyProposalResult =
  | {
      ok: true;
      patch: LimitsPatch;
      previous: Record<string, unknown>;
      limits: Record<string, unknown>;
    }
  | { ok: false; error: "not_pending" | "validation"; reason?: string };

/**
 * Confirms + applies + audits in ONE database transaction
 * (`apply_policy_change_proposal` RPC): the claim, the global_limits
 * update, and the behavioral_events record commit together — a transient
 * failure rolls all three back, leaving the proposal pending and the
 * confirm retryable. A merged-state validation failure against the live
 * row resolves the proposal to 'rejected' instead of applying.
 */
export async function applyPolicyChangeProposal(
  id: string,
  safeAddress: string
): Promise<ApplyProposalResult> {
  const { data, error } = await supabase.rpc("apply_policy_change_proposal", {
    p_id: id,
    p_safe: safeAddress.toLowerCase(),
  });
  if (error) throw error;
  return data as ApplyProposalResult;
}
