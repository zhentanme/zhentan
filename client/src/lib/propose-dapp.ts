"use client";

import { createPublicClient, http, type Address, type Hex } from "viem";
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
  BSC_RPC,
  getPimlicoRpcUrl,
} from "./constants";
import { serializeUserOp } from "./serialize";
import { apiFetch } from "./api/client";
import type { DappMetadata } from "@/types";
import type { LocalAccount } from "viem";

export interface ProposeDappParams {
  to: string;
  value: bigint;
  data: string;
  ownerAddress: string;
  getOwnerAccount: () => Promise<LocalAccount | null>;
  dappMetadata?: DappMetadata;
  /** When true, server skips risk analysis; client will call execute. */
  screeningDisabled?: boolean;
  /** Privy identity token for authenticating the backend request */
  identityToken?: string | null;
}

function requireEnv(val: string | undefined, name: string): string {
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

export async function proposeDappTransaction({
  to,
  value,
  data,
  ownerAddress,
  getOwnerAccount,
  dappMetadata,
  screeningDisabled,
  identityToken,
}: ProposeDappParams) {
  const pimlicoApiKey = requireEnv(process.env.NEXT_PUBLIC_PIMLICO_API_KEY, "NEXT_PUBLIC_PIMLICO_API_KEY");
  const ownerAddr2 = requireEnv(process.env.NEXT_PUBLIC_AGENT_ADDRESS, "NEXT_PUBLIC_AGENT_ADDRESS");

  const ownerAccount = await getOwnerAccount();
  if (!ownerAccount) throw new Error("Wallet not ready for signing");
  const owners = [toAccount(ownerAddress as Address), toAccount(ownerAddr2 as Address)];

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

  // 1. Prepare unsigned user operation with raw calldata
  const unsignedUserOp = await smartAccountClient.prepareUserOperation({
    calls: [{ to: to as Address, value, data: data as Hex }],
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
    to,
    amount: "0",
    token: "BNB",
    usdcAddress: "",
    ...(screeningDisabled && { screeningDisabled: true }),
    proposedBy: ownerAccount.address,
    signatures: [ownerAccount.address],
    ownerAddresses: [ownerAddress, ownerAddr2],
    threshold: 2,
    safeAddress: safeAccount.address,
    userOp: serializeUserOp(unsignedUserOp as unknown as Record<string, unknown>),
    partialSignatures,
    proposedAt: new Date().toISOString(),
    source: "walletconnect" as const,
    calldata: data,
    value: value.toString(),
    dappMetadata,
  };

  // 4. POST to queue
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
