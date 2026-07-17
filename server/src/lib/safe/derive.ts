/**
 * Versioned Safe address derivation — THE single source of truth for
 * counterfactual addresses. The client never derives locally; it asks
 * POST /safe/derive, so initializer bytes only ever exist here.
 *
 * A Safe's address is CREATE2(factory, hash(initializer), saltNonce): the
 * initializer encodes the full setup() call, so owners, threshold, fallback
 * handler AND any module setup all change the address. Each user's record
 * stores which derivation produced their address (user_details.
 * derivation_version) and every deploy re-derives and cross-checks.
 *
 *   v1 — legacy: permissionless toSafeSmartAccount initializer
 *        (Safe4337Module enabled + set as fallback handler). All accounts
 *        created before the SafeTx-only refactor.
 *   v2 — vanilla stock Safe: protocol-kit initializer, canonical
 *        CompatibilityFallbackHandler, no modules. Default for new users
 *        (config: SAFE_DERIVATION_VERSION).
 */
import { createPublicClient, http, type Address, type Hex } from "viem";
import { bsc } from "viem/chains";
import { toAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { toSafeSmartAccount } from "permissionless/accounts";
import SafeImport from "@safe-global/protocol-kit";

import {
  SAFE_SINGLETON,
  SAFE_PROXY_FACTORY,
  SAFE_VERSION,
  BSC_RPC,
} from "../constants.js";

// NodeNext/ESM default-export interop (same shim as service.ts).
const Safe = ((SafeImport as unknown as { default?: unknown }).default ??
  SafeImport) as typeof SafeImport.default;

export type DerivationVersion = 1 | 2;

export const DERIVATION_V1_4337 = 1 as const;
export const DERIVATION_V2_VANILLA = 2 as const;

/** Derivation used for NEW accounts. Existing accounts always use their stored version. */
export function getDefaultDerivationVersion(): DerivationVersion {
  const raw = process.env.SAFE_DERIVATION_VERSION;
  if (raw === "1") return DERIVATION_V1_4337;
  if (raw === undefined || raw === "" || raw === "2") return DERIVATION_V2_VANILLA;
  throw new Error(`Invalid SAFE_DERIVATION_VERSION: ${raw} (expected 1 or 2)`);
}

export interface DerivedSafe {
  address: Address;
  derivationVersion: DerivationVersion;
  /** Raw deployment call for the agent relayer to send. */
  deploymentTx: { to: Address; value: bigint; data: Hex };
}

async function deriveV1(owners: string[], threshold: number): Promise<DerivedSafe> {
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
  if (!factory || !factoryData) throw new Error("Failed to compute v1 factory args");
  return {
    address: account.address,
    derivationVersion: DERIVATION_V1_4337,
    deploymentTx: { to: factory, value: 0n, data: factoryData },
  };
}

async function deriveV2(owners: string[], threshold: number): Promise<DerivedSafe> {
  // One protocol-kit instance produces both the predicted address and the
  // deployment tx from the same initializer bytes — they cannot diverge.
  const kit = await Safe.init({
    provider: BSC_RPC,
    predictedSafe: {
      safeAccountConfig: { owners, threshold },
      safeDeploymentConfig: {
        saltNonce: "0",
        safeVersion: SAFE_VERSION,
      },
    },
  });
  const address = (await kit.getAddress()) as Address;
  const deployment = await kit.createSafeDeploymentTransaction();
  return {
    address,
    derivationVersion: DERIVATION_V2_VANILLA,
    deploymentTx: {
      to: deployment.to as Address,
      value: BigInt(deployment.value || "0"),
      data: deployment.data as Hex,
    },
  };
}

export async function deriveSafe(
  owners: string[],
  threshold: number,
  version: DerivationVersion
): Promise<DerivedSafe> {
  if (owners.length < 2) throw new Error("Safe derivation requires at least 2 owners");
  if (threshold < 1 || threshold > owners.length) {
    throw new Error(`Invalid threshold ${threshold} for ${owners.length} owners`);
  }
  switch (version) {
    case DERIVATION_V1_4337:
      return deriveV1(owners, threshold);
    case DERIVATION_V2_VANILLA:
      return deriveV2(owners, threshold);
    default:
      throw new Error(`Unknown derivation version: ${version}`);
  }
}

/**
 * Cross-check helper: asserts the stored owner set + version reproduce the
 * stored address. Call before any deploy or trust-sensitive operation.
 */
export async function assertDerivation(
  expectedAddress: string,
  owners: string[],
  threshold: number,
  version: DerivationVersion
): Promise<DerivedSafe> {
  const derived = await deriveSafe(owners, threshold, version);
  if (derived.address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(
      `Derivation mismatch: v${version} owners derive ${derived.address}, expected ${expectedAddress}`
    );
  }
  return derived;
}
