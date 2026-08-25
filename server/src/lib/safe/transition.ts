/**
 * Wallet-profile transition validation + post-execution persistence.
 *
 * Extracted from routes/queue.ts so three consumers share ONE simulation:
 *   - /queue         hard-validates flagged transitions before accepting them
 *   - screen jobs    mark validated owner-management self-calls in the decoded
 *                    payload, so the risk engine auto-approves them instead of
 *                    scoring the Safe's own address as an "unknown recipient"
 *   - apply.ts       mirrors the executed owner set for transitions that
 *                    landed through the screened path (async decision)
 */
import { decodeFunctionData, isAddressEqual, type Address, type Hex } from "viem";
import { decodeMultiSendData } from "@safe-global/protocol-kit";
import { getUserDetails, upsertUserDetails } from "../supabase/index.js";
import { SAFE_ABI, MULTISEND_CALL_ONLY } from "../constants.js";
import { classifyProfile, type WalletState } from "./profiles.js";
import { getAgentAddress } from "./relayer.js";
import { readSafeOwners } from "./onchain.js";
import type { PendingTransaction } from "../../types.js";

export interface TransitionTarget {
  endState: WalletState;
  endThreshold: number;
  endOwners: string[];
  /** Pre-transition profile/threshold — the state the signatures must satisfy. */
  currentState: WalletState;
  currentThreshold: number;
  /** Non-agent owners BEFORE the transition (legacy-capability input). */
  userOwnerCount: number;
  derivationVersion: number | null;
}

/**
 * Hard validation for wallet-profile transition txs (the only thing /queue
 * skips the risk engine for): owner-management calls on the caller's own
 * Safe that move between MANAGED states.
 *
 *   starter → guarded     addOwnerWithThreshold(agent, 2)
 *   starter → protected   MultiSend[addOwner(backup, 1), addOwner(agent, 2)]
 *   guarded → protected   addOwnerWithThreshold(backup, 2)   (legacy upgrade)
 *   protected → detached  removeOwner(prev, agent, 2)        (exit)
 *   backup key swap       swapOwner(prev, oldBackup, newBackup)
 *
 * Every added owner must be the agent or the REGISTERED backup key; the
 * simulated end state must classify to a managed profile (or detached, for
 * the exit). The profile must change — except for a backup-key swap, which
 * legitimately keeps the wallet protected while replacing an owner.
 */
export async function validateTransitionTx(
  pendingTx: PendingTransaction & { calldata?: string }
): Promise<TransitionTarget> {
  const { safeAddress } = pendingTx;
  // For SafeTx proposals, validate the SIGNED payload (its hash was already
  // recomputed and signature-verified) — not the loose display fields.
  const to =
    pendingTx.txType === "safetx" && pendingTx.safeTx ? pendingTx.safeTx.to : pendingTx.to;
  const calldata =
    pendingTx.txType === "safetx" && pendingTx.safeTx
      ? pendingTx.safeTx.data
      : pendingTx.calldata;
  if (!to || !calldata) throw new Error("Transition tx requires to and calldata");

  const record = await getUserDetails(safeAddress);
  if (!record) throw new Error("Unknown Safe — complete onboarding first");

  const agent = getAgentAddress();
  const currentOwners =
    record.safe_owners?.length
      ? record.safe_owners
      : [record.signer_address ?? "", agent];
  const currentThreshold = record.safe_threshold ?? 2;
  const currentState = classifyProfile(currentOwners, currentThreshold, agent);

  // Unpack the inner owner-management calls: either a single self-call, or
  // a MultiSendCallOnly batch of self-calls.
  let innerCalls: { to: string; data: Hex }[];
  if (isAddressEqual(to as Address, safeAddress as Address)) {
    innerCalls = [{ to, data: calldata as Hex }];
  } else if (isAddressEqual(to as Address, MULTISEND_CALL_ONLY as Address)) {
    innerCalls = decodeMultiSendData(calldata).map((t: { to: string; data: string }) => ({
      to: t.to,
      data: t.data as Hex,
    }));
  } else {
    throw new Error("Transition tx must target the Safe itself (or MultiSend it)");
  }
  if (innerCalls.length === 0) throw new Error("Transition tx has no calls");

  // Simulate the end state call by call.
  const owners = currentOwners.map((o) => o.toLowerCase());
  let threshold = currentThreshold;
  let swapped = false;

  for (const call of innerCalls) {
    if (!isAddressEqual(call.to as Address, safeAddress as Address)) {
      throw new Error("Every transition call must target the Safe itself");
    }
    const decoded = decodeFunctionData({ abi: SAFE_ABI, data: call.data });
    if (decoded.functionName === "addOwnerWithThreshold") {
      const [newOwner, t] = decoded.args as readonly [Address, bigint];
      const addr = newOwner.toLowerCase();
      const isAgent = addr === agent.toLowerCase();
      const isRegisteredBackup =
        !!record.external_wallet_address &&
        addr === record.external_wallet_address.toLowerCase();
      if (!isAgent && !isRegisteredBackup) {
        throw new Error(
          "Transition may only add the agent or the registered backup key as owner"
        );
      }
      if (owners.includes(addr)) throw new Error(`${newOwner} is already an owner`);
      owners.push(addr);
      threshold = Number(t);
    } else if (decoded.functionName === "removeOwner") {
      const [, removed, t] = decoded.args as readonly [Address, Address, bigint];
      const addr = removed.toLowerCase();
      if (addr !== agent.toLowerCase()) {
        throw new Error("Transition may only remove the agent (detach)");
      }
      const idx = owners.indexOf(addr);
      if (idx === -1) throw new Error("Agent is not an owner of this Safe");
      owners.splice(idx, 1);
      threshold = Number(t);
    } else if (decoded.functionName === "swapOwner") {
      const [, oldOwner, newOwner] = decoded.args as readonly [Address, Address, Address];
      const oldAddr = oldOwner.toLowerCase();
      const newAddr = newOwner.toLowerCase();
      // Only the backup slot may be swapped — never the agent, never the
      // account signer.
      if (oldAddr === agent.toLowerCase()) {
        throw new Error("Transition may not swap out the agent");
      }
      if (record.signer_address && oldAddr === record.signer_address.toLowerCase()) {
        throw new Error("Transition may not swap out the account signer");
      }
      const isRegisteredBackup =
        !!record.external_wallet_address &&
        newAddr === record.external_wallet_address.toLowerCase();
      if (!isRegisteredBackup || newAddr === agent.toLowerCase()) {
        throw new Error("Swap may only install the registered backup key as owner");
      }
      const idx = owners.indexOf(oldAddr);
      if (idx === -1) throw new Error(`${oldOwner} is not an owner of this Safe`);
      if (owners.includes(newAddr)) throw new Error(`${newOwner} is already an owner`);
      owners[idx] = newAddr;
      swapped = true;
    } else {
      throw new Error(`Unsupported transition call: ${decoded.functionName}`);
    }
  }

  const endState = classifyProfile(owners, threshold, agent);
  if (endState !== "starter" && endState !== "guarded" && endState !== "protected" && endState !== "detached") {
    throw new Error(`Transition ends in an unmanaged state (${endState})`);
  }
  if (endState === currentState && !swapped) {
    throw new Error("Transition does not change the wallet profile");
  }
  // The simulated end state IS the post-execution truth (the tx is validated
  // hard and executed atomically) — return it so finishTransition can persist
  // a deterministic threshold and owner set instead of racing an RPC read.
  return {
    endState,
    endThreshold: threshold,
    endOwners: owners,
    currentState,
    currentThreshold,
    userOwnerCount: currentOwners.filter(
      (o) => o.toLowerCase() !== agent.toLowerCase()
    ).length,
    derivationVersion: record.derivation_version ?? null,
  };
}

/**
 * After an executed transition: mirror the new owner set + threshold onto the
 * record. The threshold is taken from the VALIDATED simulation, never a
 * post-execution chain read — a load-balanced RPC (1rpc.io) can serve the
 * post-upgrade owners from one replica and the pre-upgrade threshold from
 * another, persisting an inconsistent state (e.g. `[embedded, agent]` with
 * threshold 1 → classifies as "unknown", no upgrade banner). Only the owner
 * SET is read from chain (for its correct linked-list order, which detach
 * later relies on), retried through replica lag until it matches the profile
 * the transition is known to produce.
 */
export async function finishTransition(
  safeAddress: string,
  target: Pick<TransitionTarget, "endThreshold" | "endOwners">
): Promise<void> {
  // Match the SIMULATED owner set, not just the classification — a swap keeps
  // the profile identical before and after, so classification alone can't
  // tell a lagging replica from the executed swap.
  const want = new Set(target.endOwners.map((o) => o.toLowerCase()));
  const matches = (list: string[]) =>
    list.length === want.size && list.every((o) => want.has(o.toLowerCase()));
  let owners = await readSafeOwners(safeAddress);
  for (let i = 0; i < 6 && !matches(owners); i++) {
    await new Promise((r) => setTimeout(r, 1200));
    owners = await readSafeOwners(safeAddress);
  }
  await upsertUserDetails(safeAddress, {
    safe_owners: owners,
    safe_threshold: target.endThreshold,
    safe_deployed: true,
  });
}
