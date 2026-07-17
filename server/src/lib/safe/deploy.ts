/**
 * Eager Safe deployment (SafeTx flow needs a deployed Safe — the Transaction
 * Service only indexes contracts that exist on-chain).
 *
 * Uses the exact same permissionless initializer as the client's
 * counterfactual derivation (Safe4337Module enabled), so the deployed address
 * matches; the agent EOA sends the factory call and pays gas.
 */
import { createPublicClient, http, type Address, type Hex } from "viem";
import { bsc } from "viem/chains";
import { toAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { toSafeSmartAccount } from "permissionless/accounts";

import {
  SAFE_SINGLETON,
  SAFE_PROXY_FACTORY,
  SAFE_VERSION,
  BSC_RPC,
} from "../constants.js";
import { SAFE_2OF3_THRESHOLD } from "./owners.js";
import { getAgentWalletClient, getRelayerPublicClient, assertAgentGas } from "./relayer.js";

export interface CounterfactualSafe {
  address: Address;
  factory: Address;
  factoryData: Hex;
}

/**
 * Server-side twin of the client derivation: canonical owner order in,
 * counterfactual address + factory args out.
 */
export async function computeCounterfactual(
  owners: string[],
  threshold: number = SAFE_2OF3_THRESHOLD
): Promise<CounterfactualSafe> {
  const publicClient = createPublicClient({ chain: bsc, transport: http(BSC_RPC) });

  const account = await toSafeSmartAccount({
    client: publicClient,
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    owners: owners.map((o) => toAccount(o as Address)),
    saltNonce: 0n,
    safeSingletonAddress: SAFE_SINGLETON,
    safeProxyFactoryAddress: SAFE_PROXY_FACTORY,
    version: SAFE_VERSION,
    threshold: BigInt(threshold),
  });

  const { factory, factoryData } = await account.getFactoryArgs();
  if (!factory || !factoryData) {
    throw new Error("Failed to compute Safe factory args");
  }
  return { address: account.address, factory, factoryData };
}

/**
 * Deploys the Safe for the given canonical owner set if it isn't already
 * on-chain. Idempotent. Returns the deploy tx hash when a deploy happened.
 */
export async function deploySafe(
  owners: string[],
  threshold: number = SAFE_2OF3_THRESHOLD
): Promise<{ address: Address; deployed: boolean; txHash?: Hex }> {
  const { address, factory, factoryData } = await computeCounterfactual(owners, threshold);
  const publicClient = getRelayerPublicClient();

  const code = await publicClient.getCode({ address });
  if (code && code !== "0x") {
    return { address, deployed: false };
  }

  await assertAgentGas();

  const wallet = getAgentWalletClient();
  const txHash = await wallet.sendTransaction({
    to: factory,
    data: factoryData,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`Safe deploy tx reverted: ${txHash}`);
  }

  const deployedCode = await publicClient.getCode({ address });
  if (!deployedCode || deployedCode === "0x") {
    throw new Error(`Safe deploy succeeded but no code at ${address}`);
  }

  return { address, deployed: true, txHash };
}

/** True when the given address has contract code on BSC. */
export async function isSafeDeployed(address: string): Promise<boolean> {
  const code = await getRelayerPublicClient().getCode({ address: address as Address });
  return !!code && code !== "0x";
}
