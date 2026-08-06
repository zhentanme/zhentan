/**
 * DB execution lease (D0) — the cross-process replacement for the
 * in-memory `inFlight` Set. Correctness no longer rests on PM2
 * `instances: 1` for the execute path: a claim is ONE atomic conditional
 * UPDATE (grant iff unleased, expired, or already ours — the pure rule in
 * leasePolicy.ts, which the filter below mirrors), so two claimants can
 * never both win a row.
 *
 * TTL covers a worst-case execution including the receipt wait; a crashed
 * holder's lease simply expires and the row becomes claimable again. This
 * also becomes the runtime job-lease primitive at D0.2.
 */
import { randomUUID } from "crypto";
import { hostname } from "os";
import { supabase } from "../supabase/client.js";
import { EXECUTION_LEASE_TTL_MS } from "./leasePolicy.js";

/** Stable per-process identity — future agent_instance_id ("shared-agent" era). */
export const EXECUTOR_INSTANCE_ID = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

/**
 * Atomically claim the execution lease for a transaction. Returns true when
 * this process holds the lease (fresh claim or re-entrant), false when a
 * live lease belongs to someone else.
 */
export async function claimExecutionLease(
  txId: string,
  owner: string = EXECUTOR_INSTANCE_ID,
  ttlMs: number = EXECUTION_LEASE_TTL_MS,
  now: Date = new Date()
): Promise<boolean> {
  const { data, error } = await supabase
    .from("transactions")
    .update({
      execution_lease_owner: owner,
      execution_lease_expires_at: new Date(now.getTime() + ttlMs).toISOString(),
    })
    .eq("id", txId)
    .or(
      `execution_lease_owner.is.null,execution_lease_owner.eq.${owner},execution_lease_expires_at.lt.${now.toISOString()}`
    )
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Release (only if still ours — never clobber a successor's lease). */
export async function releaseExecutionLease(
  txId: string,
  owner: string = EXECUTOR_INSTANCE_ID
): Promise<void> {
  const { error } = await supabase
    .from("transactions")
    .update({ execution_lease_owner: null, execution_lease_expires_at: null })
    .eq("id", txId)
    .eq("execution_lease_owner", owner);
  if (error) throw error;
}
