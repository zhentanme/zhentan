import type { Address } from "viem";

/**
 * Canonical 2-of-3 owner order: [user embedded wallet, user external wallet, agent].
 *
 * The POSITIONAL order of this array is encoded into the Safe's setup
 * initializer and therefore determines the counterfactual address — never
 * sort it, and never change it between derivation sites (client + server).
 *
 * Note: this is only for deriving NEW Safes. Deployed Safes must read their
 * owner set from chain or the backend record — after an on-chain
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
