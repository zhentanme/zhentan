/**
 * Read-time classification of "special" transaction rows — Safe deployment and
 * owner/config management (the wallet-profile transitions) — so history can
 * render them as configuration events instead of zero-value transfers.
 *
 * Computed from the STORED calldata on every read, never persisted: it works
 * retroactively for rows written before this existed, and can't drift from
 * what the row actually does. Zerion never returns these txs (the agent EOA
 * relays them / deploys the proxy), so our DB rows are their only source.
 */
import { decodeFunctionData, isAddressEqual, type Address, type Hex } from "viem";
import { decodeMultiSendData } from "@safe-global/protocol-kit";

import { SAFE_ABI, MULTISEND_CALL_ONLY } from "../constants.js";
import type { PendingTransaction } from "../../types.js";

export interface TxKindInfo {
  txKind: "config" | "creation";
  kindLabel: string;
}

interface DecodedCall {
  functionName: string;
  args: readonly unknown[];
}

/** Decode the owner-management calls a config tx makes on its own Safe. */
function decodeSelfCalls(tx: PendingTransaction): DecodedCall[] | null {
  if (!tx.safeTx?.data || tx.safeTx.data === "0x") return null;
  const safe = tx.safeAddress as Address;

  let inner: { to: string; data: string }[];
  try {
    if (isAddressEqual(tx.safeTx.to as Address, safe)) {
      inner = [{ to: tx.safeTx.to, data: tx.safeTx.data }];
    } else if (isAddressEqual(tx.safeTx.to as Address, MULTISEND_CALL_ONLY as Address)) {
      inner = decodeMultiSendData(tx.safeTx.data as Hex);
    } else {
      return null;
    }
    if (!inner.length || inner.some((c) => !isAddressEqual(c.to as Address, safe))) {
      return null;
    }
    return inner.map((c) => {
      const d = decodeFunctionData({ abi: SAFE_ABI, data: c.data as Hex });
      return { functionName: d.functionName, args: d.args ?? [] };
    });
  } catch {
    return null; // not Safe-ABI calldata — the caller may still fall back
  }
}

/**
 * Classifies a DB row. Returns null for ordinary transfers.
 *
 *   - decoded owner-management self-calls → precise transition labels
 *   - undecodable zero-value self-sends (legacy 4337 upgrade rows, unknown
 *     self-calls) → generic "Wallet configuration"
 */
export function classifyTxKind(
  tx: PendingTransaction,
  agentAddress: string
): TxKindInfo | null {
  if (!tx.safeAddress || !tx.to) return null;
  const isSelfTarget = tx.to.toLowerCase() === tx.safeAddress.toLowerCase();
  if (!isSelfTarget) return null;

  const agent = agentAddress.toLowerCase();
  const calls = decodeSelfCalls(tx);

  if (calls) {
    const added = calls
      .filter((c) => c.functionName === "addOwnerWithThreshold")
      .map((c) => String(c.args[0]).toLowerCase());
    const removed = calls
      .filter((c) => c.functionName === "removeOwner")
      .map((c) => String(c.args[1]).toLowerCase());

    if (added.length || removed.length) {
      const addsAgent = agent !== "" && added.includes(agent);
      const addsBackup = added.some((a) => a !== agent);
      let kindLabel: string;
      if (addsAgent && addsBackup) kindLabel = "Protection activated";
      else if (addsAgent) kindLabel = "Screening agent enabled";
      else if (addsBackup) kindLabel = "Backup key added";
      else if (agent !== "" && removed.includes(agent)) kindLabel = "Screening agent removed";
      else kindLabel = "Owners changed";
      return { txKind: "config", kindLabel };
    }
    return { txKind: "config", kindLabel: "Wallet configuration" };
  }

  // Undecodable self-call with no value moved — still configuration, just
  // without a precise label (covers the legacy 4337 upgrade rows, whose
  // calldata lives inside the stored userOp).
  const amount = parseFloat(tx.amount ?? "");
  if (!Number.isFinite(amount) || amount === 0) {
    return { txKind: "config", kindLabel: "Wallet configuration" };
  }
  return null;
}
