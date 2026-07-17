"use client";

import { parseUnits, encodeFunctionData, type Address } from "viem";

import { ERC20_APPROVE_ABI, NATIVE_TOKEN_ADDRESS } from "./constants";
import { apiFetch } from "./api/client";
import { buildSafeTxProposal, resolveCoSigner } from "./safe/proposeSafeTx";
import type { SafeCall } from "./safe/safeTx";
import type { SafeProposalContext, TokenPosition } from "@/types";

export interface SwapQuote {
  buyAmount: string;
  buyAmountUSD: string;
  sellAmountUSD: string;
  transaction: {
    to: string;
    value: string;
    data: string;
    gasLimit: string;
    gasPrice: string;
    chainId: number;
  };
  approvalAddress: string;
  tool: { key: string; name: string; logoURI: string };
  slippage?: number;
}

export interface ProposeSwapParams {
  fromToken: TokenPosition;
  toToken: TokenPosition;
  sellAmount: string;
  quote: SwapQuote;
  safe: SafeProposalContext;
  getOwnerAccount: () => Promise<import("viem").LocalAccount | null>;
  /** Backup-key signer (screening-off co-signing). */
  getBackupAccount?: () => Promise<import("viem").LocalAccount | null>;
  /** When true, server skips risk analysis; requires user signatures to meet the threshold. */
  screeningDisabled?: boolean;
  amountUSD?: string;
  identityToken?: string | null;
}

export async function proposeSwap({
  fromToken,
  toToken,
  sellAmount,
  quote,
  safe,
  getOwnerAccount,
  getBackupAccount,
  screeningDisabled,
  amountUSD,
  identityToken,
}: ProposeSwapParams) {
  const isNativeFromToken =
    fromToken.address?.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();

  const amountWei = parseUnits(sellAmount, fromToken.decimals);

  const calls: SafeCall[] = [];

  // Add ERC20 approval if selling a non-native token. In SafeTx mode the
  // approve + swap pair becomes one MultiSend batch; in 4337 mode the
  // bundler executes both calls in one userOp.
  if (!isNativeFromToken && fromToken.address && quote.approvalAddress) {
    const approveData = encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [quote.approvalAddress as Address, amountWei],
    });
    calls.push({
      to: fromToken.address as Address,
      value: 0n,
      data: approveData,
    });
  }

  // Add the swap call
  calls.push({
    to: quote.transaction.to as Address,
    value: BigInt(quote.transaction.value || "0"),
    data: quote.transaction.data as `0x${string}`,
  });

  const coSigner = await resolveCoSigner(screeningDisabled, safe, getBackupAccount);
  const signedFields = await buildSafeTxProposal({ calls, safe, getOwnerAccount, coSigner, identityToken });

  const txId = `swap-${crypto.randomUUID().slice(0, 8)}`;
  const pendingTx = {
    id: txId,
    to: quote.transaction.to,
    amount: sellAmount,
    token: `${fromToken.symbol} → ${toToken.symbol}`,
    tokenAddress: fromToken.address ?? NATIVE_TOKEN_ADDRESS,
    tokenIconUrl: fromToken.iconUrl ?? null,
    ...(amountUSD && { amountUSD }),
    ...(screeningDisabled && { screeningDisabled: true }),
    proposedAt: new Date().toISOString(),
    ...signedFields,
  };

  const res = await apiFetch("/queue", identityToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pendingTx),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to queue swap transaction");
  }

  return pendingTx;
}
