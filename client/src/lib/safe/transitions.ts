"use client";

import { encodeFunctionData, type Address, type Hex, type LocalAccount } from "viem";

import { SAFE_ABI } from "../constants";
import { apiFetch } from "../api/client";
import { buildSafeTxProposal } from "./proposeSafeTx";
import type { SafeCall } from "./safeTx";
import type { SafeProposalContext } from "@/types";

/**
 * Wallet-profile transitions — owner-management SafeTxs on the user's own
 * Safe, hard-validated and auto-executed server-side (no risk engine).
 *
 *   starter → guarded     addOwnerWithThreshold(agent, 2)
 *   starter → protected   MultiSend[addOwner(backup, 1), addOwner(agent, 2)]
 *   guarded → protected   addOwnerWithThreshold(backup, 2)
 *   protected → detached  removeOwner(prevOwner, agent, 2)
 *
 * From starter (threshold 1) the user's own signature authorizes the
 * transition and the agent merely relays; at threshold 2 the agent co-signs.
 * Batched transitions are atomic — the wallet never passes through an
 * unmanaged intermediate state.
 */

const SENTINEL_OWNER = "0x0000000000000000000000000000000000000001" as const;

function addOwnerCall(safeAddress: Address, owner: Address, threshold: bigint): SafeCall {
  return {
    to: safeAddress,
    value: 0n,
    data: encodeFunctionData({
      abi: SAFE_ABI,
      functionName: "addOwnerWithThreshold",
      args: [owner, threshold],
    }),
  };
}

/** starter → protected: backup + agent + threshold 2, atomically. */
export function activateProtectionCalls(
  safeAddress: Address,
  backup: Address,
  agent: Address
): SafeCall[] {
  return [
    addOwnerCall(safeAddress, backup, 1n),
    addOwnerCall(safeAddress, agent, 2n),
  ];
}

/** starter → guarded: agent only (screening becomes structurally mandatory). */
export function enableAgentCalls(safeAddress: Address, agent: Address): SafeCall[] {
  return [addOwnerCall(safeAddress, agent, 2n)];
}

/** guarded → protected: add the backup key (the legacy upgrade). */
export function addBackupCalls(safeAddress: Address, backup: Address): SafeCall[] {
  return [addOwnerCall(safeAddress, backup, 2n)];
}

/**
 * protected → detached: remove the agent. Safe's owner list is a linked
 * list, so the on-chain owner PRECEDING the agent must be named (sentinel
 * 0x1 when the agent is first). `owners` must be the LIVE on-chain order.
 */
export function detachAgentCalls(
  safeAddress: Address,
  owners: string[],
  agent: Address
): SafeCall[] {
  const idx = owners.findIndex((o) => o.toLowerCase() === agent.toLowerCase());
  if (idx === -1) throw new Error("Agent is not an owner of this Safe");
  const prevOwner = (idx === 0 ? SENTINEL_OWNER : owners[idx - 1]) as Address;
  return [
    {
      to: safeAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: SAFE_ABI,
        functionName: "removeOwner",
        args: [prevOwner, agent, 2n],
      }),
    },
  ];
}

/** Signs and queues a transition; the server validates hard and auto-executes. */
export async function proposeTransition({
  calls,
  label,
  safe,
  getOwnerAccount,
  identityToken,
}: {
  calls: SafeCall[];
  /** Display label, e.g. "Activate protection". */
  label: string;
  safe: SafeProposalContext;
  getOwnerAccount: () => Promise<LocalAccount | null>;
  identityToken?: string | null;
}): Promise<{ txHash?: string }> {
  const signedFields = await buildSafeTxProposal({ calls, safe, getOwnerAccount, identityToken });

  const txId = `tx-${crypto.randomUUID().slice(0, 8)}`;
  const res = await apiFetch("/queue", identityToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: txId,
      to: safe.safeAddress,
      amount: "0",
      token: "BNB",
      tokenAddress: "",
      transition: true,
      calldata: signedFields.safeTx.data as Hex,
      proposedAt: new Date().toISOString(),
      dappMetadata: { name: label, url: "https://zhentan.me" },
      ...signedFields,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    txHash?: string;
    upgraded?: boolean;
  };
  if (!res.ok) throw new Error(data.error || `${label} failed`);
  return { txHash: data.txHash };
}
