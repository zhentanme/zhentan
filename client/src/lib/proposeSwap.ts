"use client";

import {
  createPublicClient,
  http,
  parseUnits,
  encodeFunctionData,
  type Address,
} from "viem";
import { bsc } from "viem/chains";
import { toAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { toSafeSmartAccount } from "permissionless/accounts";
import { SafeSmartAccount } from "permissionless/accounts/safe";

import {
  SAFE_SINGLETON,
  SAFE_PROXY_FACTORY,
  SAFE_VERSION,
  ERC20_APPROVE_ABI,
  BSC_RPC,
  getPimlicoRpcUrl,
  NATIVE_TOKEN_ADDRESS,
} from "./constants";
import { serializeUserOp } from "./serialize";
import { apiFetch } from "./api/client";
import type { TokenPosition } from "@/types";

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
}

export interface ProposeSwapParams {
  fromToken: TokenPosition;
  toToken: TokenPosition;
  sellAmount: string;
  quote: SwapQuote;
  ownerAddress: string;
  getOwnerAccount: () => Promise<import("viem").LocalAccount | null>;
  identityToken?: string | null;
}

function requireEnv(val: string | undefined, name: string): string {
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

export async function proposeSwap({
  fromToken,
  toToken,
  sellAmount,
  quote,
  ownerAddress,
  getOwnerAccount,
  identityToken,
}: ProposeSwapParams) {
  const pimlicoApiKey = requireEnv(
    process.env.NEXT_PUBLIC_PIMLICO_API_KEY,
    "NEXT_PUBLIC_PIMLICO_API_KEY"
  );
  const ownerAddr2 = requireEnv(
    process.env.NEXT_PUBLIC_AGENT_ADDRESS,
    "NEXT_PUBLIC_AGENT_ADDRESS"
  );

  const ownerAccount = await getOwnerAccount();
  if (!ownerAccount) throw new Error("Wallet not ready for signing");

  const owners = [
    toAccount(ownerAddress as `0x${string}`),
    toAccount(ownerAddr2 as `0x${string}`),
  ];

  const publicClient = createPublicClient({
    chain: bsc,
    transport: http(BSC_RPC),
  });

  const paymasterClient = createPimlicoClient({
    transport: http(getPimlicoRpcUrl(pimlicoApiKey)),
    entryPoint: { address: entryPoint07Address, version: "0.7" },
  });

  const safeAccount = await toSafeSmartAccount({
    client: publicClient,
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    owners,
    saltNonce: 0n,
    safeSingletonAddress: SAFE_SINGLETON,
    safeProxyFactoryAddress: SAFE_PROXY_FACTORY,
    version: SAFE_VERSION,
    threshold: 2n,
  });

  const smartAccountClient = createSmartAccountClient({
    account: safeAccount,
    chain: bsc,
    paymaster: paymasterClient,
    bundlerTransport: http(getPimlicoRpcUrl(pimlicoApiKey)),
    userOperation: {
      estimateFeesPerGas: async () =>
        (await paymasterClient.getUserOperationGasPrice()).fast,
    },
  });

  const isNativeFromToken =
    fromToken.address?.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();

  const amountWei = parseUnits(sellAmount, fromToken.decimals);

  const calls: { to: Address; value: bigint; data: `0x${string}` }[] = [];

  // Add ERC20 approval if selling a non-native token
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

  console.log("calls", calls);

  const unsignedUserOp = await smartAccountClient.prepareUserOperation({ calls });

  const partialSignatures = await SafeSmartAccount.signUserOperation({
    version: SAFE_VERSION,
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    chainId: bsc.id,
    owners,
    account: ownerAccount,
    ...unsignedUserOp,
  });

  const txId = `swap-${crypto.randomUUID().slice(0, 8)}`;
  const pendingTx = {
    id: txId,
    to: quote.transaction.to,
    amount: sellAmount,
    token: `${fromToken.symbol} → ${toToken.symbol}`,
    tokenAddress: fromToken.address ?? NATIVE_TOKEN_ADDRESS,
    tokenIconUrl: fromToken.iconUrl ?? null,
    screeningDisabled: true,
    proposedBy: ownerAccount.address,
    signatures: [ownerAccount.address],
    ownerAddresses: [ownerAddress, ownerAddr2],
    threshold: 2,
    safeAddress: safeAccount.address,
    userOp: serializeUserOp(unsignedUserOp as unknown as Record<string, unknown>),
    partialSignatures,
    proposedAt: new Date().toISOString(),
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
