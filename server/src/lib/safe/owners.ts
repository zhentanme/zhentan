import type { Address } from "viem";

/**
 * Canonical 2-of-3 owner order: [user embedded wallet, user external wallet, agent].
 *
 * The POSITIONAL order of this array is encoded into the Safe's setup
 * initializer and therefore determines the counterfactual address — never
 * sort it, and it must match the client's copy in
 * client/src/lib/safe/owners.ts exactly.
 *
 * Only for deriving NEW Safes. Deployed Safes must read their owner set from
 * chain (getOwners) or the user record — after an on-chain
 * addOwnerWithThreshold the linked-list order differs from this one.
 */
export function canonicalOwners(
  embedded: Address,
  external: Address,
  agent: Address
): Address[] {
  return [embedded, external, agent];
}

export const SAFE_2OF3_THRESHOLD = 2;

/**
 * Validates a client-supplied owner set for Safe creation: exactly three
 * distinct addresses with the agent in the last position.
 */
export function assertCanonical(owners: string[], agentAddress: string): void {
  if (owners.length !== 3) {
    throw new Error(`Expected 3 owners, got ${owners.length}`);
  }
  const lower = owners.map((o) => o.toLowerCase());
  if (new Set(lower).size !== 3) {
    throw new Error("Owner addresses must be distinct");
  }
  if (lower[2] !== agentAddress.toLowerCase()) {
    throw new Error("Agent must be the last owner in the canonical set");
  }
}
