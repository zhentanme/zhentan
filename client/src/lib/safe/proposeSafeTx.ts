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
  userSignatures?: { signer: string; data: Hex }[];
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
/**
 * Screening-off rule: the agent must not sign what it didn't screen, so the
 * user's own signatures have to meet the threshold. At threshold 1 (starter)
 * the primary signature suffices; above that the backup key must co-sign.
 *
 * ONLY the WalletConnect dapp flow still co-signs inline at propose time — a
 * connected dapp waits synchronously for a result, so the backup session (if
 * any) signs right away. User-initiated sends/swaps deliberately do NOT:
 * they propose at 1/n, land on the queued screen, and the user co-signs
 * explicitly from there (useCoSignTransaction) or in the Safe app. The
 * server refuses to execute the row until the signatures arrive.
 *
 * Legacy v1 wallets (pre-refactor 2-of-2) have no backup key: the agent
 * remains their co-signer, so the embedded signature alone is enough (it
 * signs on execute without running risk analysis).
 */
export async function resolveCoSigner(
  screeningDisabled: boolean | undefined,
  safe: SafeProposalContext,
  getBackupAccount?: () => Promise<LocalAccount | null>
): Promise<LocalAccount | null> {
  if (!screeningDisabled || safe.threshold <= 1) return null;
  return (await getBackupAccount?.()) ?? null;
}

export async function buildSafeTxProposal({
  calls,
  safe,
  getOwnerAccount,
  coSigner,
  identityToken,
  forceExecute,
}: {
  calls: SafeCall[];
  safe: SafeProposalContext;
  getOwnerAccount: () => Promise<LocalAccount | null>;
  /**
   * Additional user signer (the backup key's active session) — used when the
   * user's own signatures must meet the threshold (screening off), so the
   * agent relays without signing.
   */
  coSigner?: LocalAccount | null;
  identityToken?: string | null;
  /**
   * Take the current executable nonce (mode=current) instead of the queue-tail,
   * so this tx skips a stuck proposal and replaces whatever is pending there.
   * Execution still runs through the normal flow (screening included).
   */
  forceExecute?: boolean;
}): Promise<ProposalSafeTxFields> {
  const ownerAccount = await getOwnerAccount();
  if (!ownerAccount) throw new Error("Wallet not ready for signing");

  // Next unused Safe nonce (Transaction Service queue aware, on-chain fallback),
  // or the current executable nonce when force-executing.
  const nonceRes = await apiFetch(
    `/safe/nonce?safe=${safe.safeAddress}${forceExecute ? "&mode=current" : ""}`,
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

  let userSignatures: { signer: string; data: Hex }[] | undefined;
  if (coSigner) {
    const coSignature = await signSafeTx(coSigner, safeAddress, safeTx);
    userSignatures = [{ signer: coSigner.address, data: coSignature }];
  }

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
    ...(userSignatures && { userSignatures }),
    rejectionSignature,
  };
}
