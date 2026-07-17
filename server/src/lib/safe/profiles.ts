/**
 * Wallet profiles — the creation recipes and live states an account can be in.
 *
 *   starter    [embedded]                 t=1  no agent; screening unavailable
 *   guarded    [embedded, agent]          t=2  screening structurally mandatory;
 *                                              lockout risk disclosed; upgrade nudged
 *   protected  [embedded, backup, agent]  t=2  full model: screening + sovereignty
 *   detached   user keys only             t=2  exit state (agent removed) — not creatable
 *
 * Invariants enforced here:
 *   HARD — the agent never reaches the threshold alone (in any state).
 *   SOFT — the user's keys meet the threshold; waived knowingly in `guarded`
 *          only, and always restorable via the guarded→protected upgrade.
 *
 * A profile is a pure function of (owners, threshold, agent membership) —
 * it is computed, never stored, so it cannot drift from chain truth.
 */
import { isAddress } from "viem";

export type WalletProfile = "starter" | "guarded" | "protected";
export type WalletState = WalletProfile | "detached" | "unknown";

export interface ProfileOwnerInputs {
  embedded: string;
  backup?: string;
  agent: string;
}

interface ProfileRecipe {
  threshold: number;
  /** Builds the CREATION owner order (positional — determines the address). */
  buildOwners(inputs: ProfileOwnerInputs): string[];
  /** Validates a claimed creation owner set for this profile. */
  validate(owners: string[], agentAddress: string): void;
}

function assertDistinctValidAddresses(owners: string[]): void {
  for (const o of owners) {
    if (!isAddress(o)) throw new Error(`Invalid owner address: ${o}`);
  }
  if (new Set(owners.map((o) => o.toLowerCase())).size !== owners.length) {
    throw new Error("Owner addresses must be distinct");
  }
}

export const PROFILES: Record<WalletProfile, ProfileRecipe> = {
  starter: {
    threshold: 1,
    buildOwners: ({ embedded }) => [embedded],
    validate(owners, agentAddress) {
      assertDistinctValidAddresses(owners);
      if (owners.length !== 1) throw new Error("starter expects exactly 1 owner");
      if (owners[0].toLowerCase() === agentAddress.toLowerCase()) {
        throw new Error("starter owner cannot be the agent");
      }
    },
  },
  guarded: {
    threshold: 2,
    buildOwners: ({ embedded, agent }) => [embedded, agent],
    validate(owners, agentAddress) {
      assertDistinctValidAddresses(owners);
      if (owners.length !== 2) throw new Error("guarded expects exactly 2 owners");
      if (owners[1].toLowerCase() !== agentAddress.toLowerCase()) {
        throw new Error("guarded expects the agent as the last owner");
      }
    },
  },
  protected: {
    threshold: 2,
    buildOwners: ({ embedded, backup, agent }) => {
      if (!backup) throw new Error("protected requires a backup key");
      return [embedded, backup, agent];
    },
    validate(owners, agentAddress) {
      assertDistinctValidAddresses(owners);
      if (owners.length !== 3) throw new Error("protected expects exactly 3 owners");
      if (owners[2].toLowerCase() !== agentAddress.toLowerCase()) {
        throw new Error("protected expects the agent as the last owner");
      }
    },
  },
};

/**
 * Classifies a LIVE owner set (chain/DB order — may differ from creation
 * order after upgrades; membership is what matters here).
 */
export function classifyProfile(
  owners: string[],
  threshold: number,
  agentAddress: string
): WalletState {
  const lower = owners.map((o) => o.toLowerCase());
  const agent = agentAddress.toLowerCase();
  const hasAgent = lower.includes(agent);
  const userKeys = lower.filter((o) => o !== agent).length;

  if (!hasAgent) {
    if (owners.length === 1 && threshold === 1) return "starter";
    if (owners.length >= 2 && threshold === 2) return "detached";
    return "unknown";
  }
  if (userKeys === 1 && threshold === 2) return "guarded";
  if (userKeys === 2 && threshold === 2) return "protected";
  return "unknown";
}

/** True when the user's own keys meet the threshold (agent not needed). */
export function userMeetsThreshold(
  owners: string[],
  threshold: number,
  agentAddress: string
): boolean {
  const agent = agentAddress.toLowerCase();
  const userKeys = owners.filter((o) => o.toLowerCase() !== agent).length;
  return userKeys >= threshold;
}
