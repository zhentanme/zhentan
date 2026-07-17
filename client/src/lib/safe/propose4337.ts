"use client";

import { createPublicClient, http, type Address, type LocalAccount } from "viem";
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
} from "../constants";
import { serializeUserOp } from "../serialize";
import type { SafeCall } from "./safeTx";
import type { SafeProposalContext } from "@/types";

function requireEnv(val: string | undefined, name: string): string {
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

export interface Proposal4337Fields {
  txType: "4337";
  proposedBy: string;
  signatures: string[];
  ownerAddresses: string[];
  threshold: number;
  safeAddress: string;
  userOp: Record<string, unknown>;
  partialSignatures: string;
}

/**
 * The gasless ERC-4337 proposal core: prepares a userOp via Pimlico
 * (paymaster-sponsored), signs the Safe4337Module userOp hash with the
 * embedded wallet, and returns the queue-payload fragment. The agent
 * co-signs and submits to the bundler server-side.
 *
 * Used when executionMode is "4337" and for the legacy 2-of-2 upgrade tx.
 */
export async function build4337Proposal({
  calls,
  safe,
  getOwnerAccount,
}: {
  calls: SafeCall[];
  safe: SafeProposalContext;
  getOwnerAccount: () => Promise<LocalAccount | null>;
}): Promise<Proposal4337Fields> {
  const pimlicoApiKey = requireEnv(
    process.env.NEXT_PUBLIC_PIMLICO_API_KEY,
    "NEXT_PUBLIC_PIMLICO_API_KEY"
  );

  const ownerAccount = await getOwnerAccount();
  if (!ownerAccount) throw new Error("Wallet not ready for signing");

  const owners = safe.owners.map((o) => toAccount(o as Address));

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
    threshold: BigInt(safe.threshold),
    // Pin the deployed address: an upgraded Safe's on-chain owner set no
    // longer matches the 2-owner initializer its address was derived from.
    address: safe.safeAddress as Address,
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

  const unsignedUserOp = await smartAccountClient.prepareUserOperation({ calls });

  const partialSignatures = await SafeSmartAccount.signUserOperation({
    version: SAFE_VERSION,
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    chainId: bsc.id,
    owners,
    account: ownerAccount,
    ...unsignedUserOp,
  });

  return {
    txType: "4337",
    proposedBy: ownerAccount.address,
    signatures: [ownerAccount.address],
    ownerAddresses: safe.owners,
    threshold: safe.threshold,
    safeAddress: safe.safeAddress,
    userOp: serializeUserOp(unsignedUserOp as unknown as Record<string, unknown>),
    partialSignatures,
  };
}
