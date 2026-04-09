"use client";

import { createPublicClient, http, parseUnits, encodeFunctionData, type Address } from "viem";
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
  USDC_DECIMALS,
  ERC20_TRANSFER_ABI,
  BSC_RPC,
  getPimlicoRpcUrl,
  NATIVE_TOKEN_ADDRESS,
  NATIVE_DECIMALS,
} from "./constants";
import { serializeUserOp } from "./serialize";
import { apiFetch } from "./api/client";
import type { ProposeParams } from "@/types";

// Next.js only inlines env vars when you use static access (process.env.NEXT_PUBLIC_*).
// Dynamic process.env[key] is not replaced at build time, so it's empty in the client bundle.
function requireEnv(val: string | undefined, name: string): string {
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

export async function proposeTransaction({
  recipient,
  amount,
  ownerAddress,
  getOwnerAccount,
  tokenAddress: tokenAddressParam,
  tokenDecimals,
  tokenSymbol,
  tokenIconUrl,
  screeningDisabled,
  amountUSD,
  identityToken,
}: ProposeParams) {
  const pimlicoApiKey = requireEnv(process.env.NEXT_PUBLIC_PIMLICO_API_KEY, "NEXT_PUBLIC_PIMLICO_API_KEY");
  const ownerAddr2 = requireEnv(process.env.NEXT_PUBLIC_AGENT_ADDRESS, "NEXT_PUBLIC_AGENT_ADDRESS");
  const tokenAddress = tokenAddressParam;
  if (!tokenAddress) throw new Error("Token address required");
  const decimals = tokenDecimals ?? USDC_DECIMALS;
  const symbol = tokenSymbol ?? "USDC";
  const isNative =
    tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();

  const ownerAccount = await getOwnerAccount();
  if (!ownerAccount) throw new Error("Wallet not ready for signing");
  const owners = [toAccount(ownerAddress as `0x${string}`), toAccount(ownerAddr2 as `0x${string}`)];

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

  console.log("Safe account:", safeAccount.address);

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

  const amountWei = parseUnits(amount.toString(), decimals);

  let calls: { to: Address; value: bigint; data: `0x${string}` }[];
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

  // 1. Prepare unsigned user operation
  const unsignedUserOp = await smartAccountClient.prepareUserOperation({
    calls,
  });

  // 2. Owner signs their part
  const partialSignatures = await SafeSmartAccount.signUserOperation({
    version: SAFE_VERSION,
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    chainId: bsc.id,
    owners,
    account: ownerAccount,
    ...unsignedUserOp,
  });

  // 3. Build pending tx object
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
    proposedBy: ownerAccount.address,
    signatures: [ownerAccount.address],
    ownerAddresses: [ownerAddress, ownerAddr2],
    threshold: 2,
    safeAddress: safeAccount.address,
    userOp: serializeUserOp(unsignedUserOp as unknown as Record<string, unknown>),
    partialSignatures,
    proposedAt: new Date().toISOString(),
  };

  // 4. POST to API route or backend to save to queue
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
