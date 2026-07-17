/**
 * Versioned Safe address derivation — THE single source of truth for
 * counterfactual addresses. The client never derives locally; it asks
 * POST /safe/derive, so initializer bytes only ever exist here.
 *
 * A Safe's address is CREATE2(factory, hash(initializer), saltNonce): the
 * initializer encodes the full setup() call, so owners, threshold, fallback
 * handler AND any module setup all change the address.
 *
 * Every account's birth certificate — (creation owners, creation threshold,
 * creation salt nonce, derivation version) — is snapshotted immutably on its
 * record at creation, so the address stays re-derivable forever, even after
 * on-chain owner changes rewrite the live owner set.
 *
 * ── The registry ─────────────────────────────────────────────────────────
 * One entry per initializer recipe, frozen once shipped. Adding a v3 is:
 * append an entry here + set SAFE_DERIVATION_VERSION=3. Existing accounts
 * are pinned to their stored version and never migrate between versions.
 *
 *   v1 — legacy: permissionless toSafeSmartAccount initializer
 *        (Safe4337Module enabled + set as fallback handler). All accounts
 *        created before the SafeTx-only refactor.
 *   v2 — vanilla stock Safe: protocol-kit initializer, canonical
 *        CompatibilityFallbackHandler, no modules. Default for new accounts.
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

export const DEFAULT_SALT_NONCE = "0";

export interface DerivedSafe {
  address: Address;
  derivationVersion: DerivationVersion;
  /** Raw deployment call for the agent relayer to send. */
  deploymentTx: { to: Address; value: bigint; data: Hex };
}

interface DerivationRecipe {
  version: DerivationVersion;
  /** Human-readable provenance, shown in audits/logs. */
  description: string;
  derive(owners: string[], threshold: number, saltNonce: string): Promise<DerivedSafe>;
}

const v1Recipe: DerivationRecipe = {
  version: DERIVATION_V1_4337,
  description:
    "permissionless toSafeSmartAccount initializer — Safe4337Module enabled and set as fallback handler (pre-SafeTx-refactor accounts)",
  async derive(owners, threshold, saltNonce) {
    const publicClient = createPublicClient({ chain: bsc, transport: http(BSC_RPC) });
    const account = await toSafeSmartAccount({
      client: publicClient,
      entryPoint: { address: entryPoint07Address, version: "0.7" },
      owners: owners.map((o) => toAccount(o as Address)),
      saltNonce: BigInt(saltNonce),
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
  },
};

const v2Recipe: DerivationRecipe = {
  version: DERIVATION_V2_VANILLA,
  description:
    "protocol-kit vanilla stock Safe — CompatibilityFallbackHandler, no modules",
  async derive(owners, threshold, saltNonce) {
    // One protocol-kit instance produces both the predicted address and the
    // deployment tx from the same initializer bytes — they cannot diverge.
    const kit = await Safe.init({
      provider: BSC_RPC,
      predictedSafe: {
        safeAccountConfig: { owners, threshold },
        safeDeploymentConfig: {
          saltNonce,
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
  },
};

const DERIVATIONS: Record<number, DerivationRecipe> = {
  [DERIVATION_V1_4337]: v1Recipe,
  [DERIVATION_V2_VANILLA]: v2Recipe,
  // v3 goes here.
};

export function getDerivationRecipe(version: number): DerivationRecipe {
  const recipe = DERIVATIONS[version];
  if (!recipe) throw new Error(`Unknown derivation version: ${version}`);
  return recipe;
}

/** Derivation used for NEW accounts. Existing accounts always use their stored version. */
export function getDefaultDerivationVersion(): DerivationVersion {
  const raw = process.env.SAFE_DERIVATION_VERSION;
  if (raw === undefined || raw === "") return DERIVATION_V2_VANILLA;
  const parsed = Number(raw);
  if (!DERIVATIONS[parsed]) {
    throw new Error(
      `Invalid SAFE_DERIVATION_VERSION: ${raw} (known: ${Object.keys(DERIVATIONS).join(", ")})`
    );
  }
  return parsed as DerivationVersion;
}

export async function deriveSafe(
  owners: string[],
  threshold: number,
  version: DerivationVersion,
  saltNonce: string = DEFAULT_SALT_NONCE
): Promise<DerivedSafe> {
  if (owners.length < 1) throw new Error("Safe derivation requires at least 1 owner");
  if (threshold < 1 || threshold > owners.length) {
    throw new Error(`Invalid threshold ${threshold} for ${owners.length} owners`);
  }
  return getDerivationRecipe(version).derive(owners, threshold, saltNonce);
}

/**
 * Cross-check helper: asserts the given recipe reproduces the expected
 * address. Valid forever when fed an account's CREATION snapshot (owner
 * changes never touch it); only valid pre-deploy when fed live owners.
 */
export async function assertDerivation(
  expectedAddress: string,
  owners: string[],
  threshold: number,
  version: DerivationVersion,
  saltNonce: string = DEFAULT_SALT_NONCE
): Promise<DerivedSafe> {
  const derived = await deriveSafe(owners, threshold, version, saltNonce);
  if (derived.address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(
      `Derivation mismatch: v${version} owners derive ${derived.address}, expected ${expectedAddress}`
    );
  }
  return derived;
}
