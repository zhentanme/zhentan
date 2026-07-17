"use client";

import type { Address, Hex, LocalAccount } from "viem";

import { apiFetch } from "../api/client";
import {
  buildSafeTx,
  buildRejectionTx,
  getSafeTxHash,
  signSafeTx,
  type SafeCall,
} from "./safeTx";
import type { SafeProposalContext, SafeTxData } from "@/types";

export interface ProposalSafeTxFields {
  txType: "safetx";
  proposedBy: string;
  signatures: string[];
  ownerAddresses: string[];
  threshold: number;
  safeAddress: string;
  safeTx: SafeTxData;
  safeTxHash: Hex;
  safeNonce: number;
  userSignature: Hex;
  rejectionSignature: Hex;
}

/**
 * The Safe-UI-compatible proposal core: builds a standard SafeTx (MultiSend
 * batch when several calls), signs its EIP-712 hash with the embedded wallet,
 * and pre-signs the same-nonce rejection tx so a later reject can consume the
 * nonce without another wallet prompt.
 *
 * The server proposes the result to the Safe Transaction Service; the agent
 * confirms and relays execTransaction on approval.
 */
export async function buildSafeTxProposal({
  calls,
  safe,
  getOwnerAccount,
  identityToken,
}: {
  calls: SafeCall[];
  safe: SafeProposalContext;
  getOwnerAccount: () => Promise<LocalAccount | null>;
  identityToken?: string | null;
}): Promise<ProposalSafeTxFields> {
  const ownerAccount = await getOwnerAccount();
  if (!ownerAccount) throw new Error("Wallet not ready for signing");

  // Next unused Safe nonce (Transaction Service queue aware, on-chain fallback).
  const nonceRes = await apiFetch(
    `/safe/nonce?safe=${safe.safeAddress}`,
    identityToken ?? null
  );
  if (!nonceRes.ok) {
    const err = await nonceRes.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error || "Failed to fetch Safe nonce"
    );
  }
  const { nonce } = (await nonceRes.json()) as { nonce: number };

  const safeAddress = safe.safeAddress as Address;
  const safeTx = buildSafeTx(calls, nonce);
  const safeTxHash = getSafeTxHash(safeAddress, safeTx);
  const userSignature = await signSafeTx(ownerAccount, safeAddress, safeTx);

  // Pre-sign the cancel tx at the same nonce. Embedded-wallet signing is
  // headless, so this costs no extra prompt — and without it a rejection
  // leaves a nonce hole that blocks every later proposal.
  const rejectionTx = buildRejectionTx(safeAddress, nonce);
  const rejectionSignature = await signSafeTx(ownerAccount, safeAddress, rejectionTx);

  return {
    txType: "safetx",
    proposedBy: ownerAccount.address,
    signatures: [ownerAccount.address],
    ownerAddresses: safe.owners,
    threshold: safe.threshold,
    safeAddress: safe.safeAddress,
    safeTx,
    safeTxHash,
    safeNonce: nonce,
    userSignature,
    rejectionSignature,
  };
}
