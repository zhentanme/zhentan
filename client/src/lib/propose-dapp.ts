"use client";

import type { Address, Hex, LocalAccount } from "viem";

import { apiFetch } from "./api/client";
import { buildSafeTxProposal } from "./safe/proposeSafeTx";
import type { SafeCall } from "./safe/safeTx";
import type { DappMetadata, SafeProposalContext } from "@/types";

export interface ProposeDappParams {
  to: string;
  value: bigint;
  data: string;
  safe: SafeProposalContext;
  getOwnerAccount: () => Promise<LocalAccount | null>;
  dappMetadata?: DappMetadata;
  /** When true, server skips risk analysis; client will call execute. */
  screeningDisabled?: boolean;
  /**
   * Marks the legacy 2-of-2 → 2-of-3 upgrade tx (addOwnerWithThreshold on the
   * Safe itself). The server validates the calldata hard and skips screening.
   */
  upgrade?: boolean;
  /** Privy identity token for authenticating the backend request */
  identityToken?: string | null;
}

export async function proposeDappTransaction({
  to,
  value,
  data,
  safe,
  getOwnerAccount,
  dappMetadata,
  screeningDisabled,
  upgrade,
  identityToken,
}: ProposeDappParams) {
  const calls: SafeCall[] = [{ to: to as Address, value, data: data as Hex }];

  const signedFields = await buildSafeTxProposal({ calls, safe, getOwnerAccount, identityToken });

  const txId = `tx-${crypto.randomUUID().slice(0, 8)}`;
  const pendingTx = {
    id: txId,
    to,
    amount: "0",
    token: "BNB",
    tokenAddress: "",
    ...(screeningDisabled && { screeningDisabled: true }),
    ...(upgrade && { upgrade: true }),
    proposedAt: new Date().toISOString(),
    source: "walletconnect" as const,
    calldata: data,
    value: value.toString(),
    dappMetadata,
    ...signedFields,
  };

  const res = await apiFetch("/queue", identityToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pendingTx),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to queue transaction");
  }

  return pendingTx;
}
