/**
 * Eager Safe deployment (the SafeTx flow needs a deployed Safe — the
 * Transaction Service only indexes contracts that exist on-chain).
 *
 * Deployment bytes come from lib/safe/derive.ts (versioned — the initializer
 * must reproduce the account's stored address exactly), and the agent EOA
 * sends the factory call and pays gas.
 */
import type { Address, Hex } from "viem";

import {
  deriveSafe,
  getDefaultDerivationVersion,
  type DerivationVersion,
} from "./derive.js";
import { SAFE_2OF3_THRESHOLD } from "./owners.js";
import { getAgentWalletClient, getRelayerPublicClient, assertAgentGas } from "./relayer.js";

export interface CounterfactualSafe {
  address: Address;
  derivationVersion: DerivationVersion;
  /** Absent when the account is already deployed (nothing to deploy). */
  deploymentTx?: { to: Address; value: bigint; data: Hex };
}

/** Versioned counterfactual derivation (see derive.ts for the version story). */
export async function computeCounterfactual(
  owners: string[],
  threshold: number = SAFE_2OF3_THRESHOLD,
  version: DerivationVersion = getDefaultDerivationVersion()
): Promise<CounterfactualSafe> {
  return deriveSafe(owners, threshold, version);
}

/**
 * Deploys the Safe for the given owner set if it isn't already on-chain.
 * Idempotent. Returns the deploy tx hash when a deploy happened.
 */
export async function deploySafe(
  owners: string[],
  threshold: number = SAFE_2OF3_THRESHOLD,
  version: DerivationVersion = getDefaultDerivationVersion()
): Promise<{ address: Address; deployed: boolean; txHash?: Hex }> {
  const { address, deploymentTx } = await computeCounterfactual(owners, threshold, version);
  const publicClient = getRelayerPublicClient();

  const code = await publicClient.getCode({ address });
  if (code && code !== "0x") {
    return { address, deployed: false };
  }
  if (!deploymentTx) {
    throw new Error(`No deployment tx available for undeployed Safe ${address}`);
  }

  await assertAgentGas();

  const wallet = getAgentWalletClient();
  const txHash = await wallet.sendTransaction({
    to: deploymentTx.to,
    value: deploymentTx.value,
    data: deploymentTx.data,
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
