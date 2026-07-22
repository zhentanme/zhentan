"use client";

import { parseUnits, encodeFunctionData, type Address } from "viem";

import {
  USDC_DECIMALS,
  ERC20_TRANSFER_ABI,
  NATIVE_TOKEN_ADDRESS,
} from "./constants";
import { apiFetch } from "./api/client";
import { buildSafeTxProposal } from "./safe/proposeSafeTx";
import type { SafeCall } from "./safe/safeTx";
import type { ProposeParams } from "@/types";

export async function proposeTransaction({
  recipient,
  amount,
  safe,
  getOwnerAccount,
  tokenAddress: tokenAddressParam,
  tokenDecimals,
  tokenSymbol,
  tokenIconUrl,
  screeningDisabled,
  forceExecute,
  amountUSD,
  identityToken,
}: ProposeParams) {
  const tokenAddress = tokenAddressParam;
  if (!tokenAddress) throw new Error("Token address required");
  const decimals = tokenDecimals ?? USDC_DECIMALS;
  const symbol = tokenSymbol ?? "USDC";
  const isNative =
    tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();

  const amountWei = parseUnits(amount.toString(), decimals);

  let calls: SafeCall[];
  if (isNative) {
    // Native BNB transfer: send value to recipient
    calls = [
      { to: recipient as Address, value: amountWei, data: "0x" as `0x${string}` },
    ];
  } else {
    // ERC20 transfer
    const data = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [recipient as `0x${string}`, amountWei],
    });
    calls = [{ to: tokenAddress as Address, value: 0n, data }];
  }

  // No inline co-signing: a screening-off send in a protected wallet always
  // proposes at 1/n and lands on the queued screen, where the user signs
  // with the backup key deliberately (or in the Safe app) — no surprise
  // wallet popup mid-propose.
  const signedFields = await buildSafeTxProposal({
    calls,
    safe,
    getOwnerAccount,
    identityToken,
    forceExecute,
  });

  const txId = `tx-${crypto.randomUUID().slice(0, 8)}`;
  const pendingTx = {
    id: txId,
    to: recipient,
    amount,
    token: symbol,
    tokenAddress: isNative ? NATIVE_TOKEN_ADDRESS : tokenAddress,
    tokenIconUrl: tokenIconUrl ?? null,
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
    throw new Error(err.error || "Failed to queue transaction");
  }

  return pendingTx;
}
