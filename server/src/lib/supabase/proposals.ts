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
 * Atomically resolves a pending proposal. Returns the claimed row, or null
 * when the proposal is not pending anymore (resolved concurrently) or has
 * expired — confirmation past the TTL is refused even before the lazy
 * expiry sweep has run.
 */
export async function claimProposal(
  id: string,
  safeAddress: string,
  resolution: "confirmed" | "rejected",
  opts?: { confirmedVia?: string; rejectReason?: string }
): Promise<PolicyChangeProposalRow | null> {
  const { data, error } = await supabase
    .from("policy_change_proposals")
    .update({
      status: resolution,
      resolved_at: new Date().toISOString(),
      confirmed_via: opts?.confirmedVia ?? null,
      reject_reason: opts?.rejectReason ?? null,
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

/**
 * Post-claim safety valve: a confirmed proposal whose patch fails
 * re-validation against the live row (the row changed between creation and
 * apply) is flipped to rejected with the validation error as the reason.
 */
export async function markClaimedProposalRejected(
  id: string,
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from("policy_change_proposals")
    .update({ status: "rejected", reject_reason: reason })
    .eq("id", id)
    .eq("status", "confirmed");
  if (error) throw error;
}
