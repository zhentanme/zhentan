/**
 * Safe Transaction Service + protocol-kit access (SafeTx flow).
 *
 * The API key lives server-side only. The agent (AGENT_PRIVATE_KEY) is both
 * the co-signing owner and the execTransaction relayer.
 */
import SafeApiKitImport from "@safe-global/api-kit";
import SafeImport from "@safe-global/protocol-kit";
import {
  getAddress,
  hashTypedData,
  recoverAddress,
  type Address,
  type Hex,
} from "viem";
import { bsc } from "viem/chains";

import { BSC_RPC, SAFE_TX_TYPES } from "../constants.js";
import { getRelayerPublicClient } from "./relayer.js";
import type { SafeTxData } from "../../types.js";

// Both packages ship CJS-flavoured type declarations (`export default`) but a
// real ESM build at runtime — under NodeNext the class may sit either on the
// import itself (ESM) or on `.default` (CJS). Normalize once.
type SafeApiKit = InstanceType<typeof SafeApiKitImport.default>;
type Safe = InstanceType<typeof SafeImport.default>;
const SafeApiKit = ((SafeApiKitImport as unknown as { default?: unknown }).default ??
  SafeApiKitImport) as typeof SafeApiKitImport.default;
const Safe = ((SafeImport as unknown as { default?: unknown }).default ??
  SafeImport) as typeof SafeImport.default;

let apiKit: SafeApiKit | null = null;

export function getApiKit(): SafeApiKit {
  if (apiKit) return apiKit;
  const apiKey = process.env.SAFE_API_KEY;
  const txServiceUrl = process.env.SAFE_TX_SERVICE_URL || undefined;
  if (!apiKey && !txServiceUrl) {
    throw new Error("Missing SAFE_API_KEY (or SAFE_TX_SERVICE_URL override)");
  }
  apiKit = new SafeApiKit({
    chainId: BigInt(bsc.id),
    ...(apiKey && { apiKey }),
    ...(txServiceUrl && { txServiceUrl }),
  });
  return apiKit;
}

// protocol-kit instances are per-Safe; cache them (RPC + signer are static).
const protocolKits = new Map<string, Promise<Safe>>();

export function getProtocolKit(safeAddress: string): Promise<Safe> {
  const key = safeAddress.toLowerCase();
  let kit = protocolKits.get(key);
  if (!kit) {
    const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
    if (!agentPrivateKey) throw new Error("Missing AGENT_PRIVATE_KEY");
    kit = Safe.init({
      provider: BSC_RPC,
      signer: agentPrivateKey,
      safeAddress,
    });
    protocolKits.set(key, kit);
    // Don't cache failures (e.g. transient RPC errors during init).
    kit.catch(() => protocolKits.delete(key));
  }
  return kit;
}

/** Recomputes the EIP-712 SafeTx hash — never trust the client's copy. */
export function computeSafeTxHash(safeAddress: string, safeTx: SafeTxData): Hex {
  return hashTypedData({
    domain: { chainId: bsc.id, verifyingContract: safeAddress as Address },
    types: SAFE_TX_TYPES,
    primaryType: "SafeTx",
    message: {
      to: safeTx.to as Address,
      value: BigInt(safeTx.value),
      data: safeTx.data as Hex,
      operation: safeTx.operation,
      safeTxGas: BigInt(safeTx.safeTxGas),
      baseGas: BigInt(safeTx.baseGas),
      gasPrice: BigInt(safeTx.gasPrice),
      gasToken: safeTx.gasToken as Address,
      refundReceiver: safeTx.refundReceiver as Address,
      nonce: BigInt(safeTx.nonce),
    },
  });
}

/** Recovers the signer of a raw (v ∈ {27,28}) signature over a SafeTx hash. */
export async function recoverSafeTxSigner(
  safeTxHash: Hex,
  signature: Hex
): Promise<Address> {
  return recoverAddress({ hash: safeTxHash, signature });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Proposes a SafeTx to the Transaction Service, retrying through the
 * indexing window right after an eager deploy (the service 404/422s until
 * its indexer has seen the Safe).
 */
export async function proposeToService({
  safeAddress,
  safeTx,
  safeTxHash,
  senderAddress,
  senderSignature,
  origin = "Zhentan",
}: {
  safeAddress: string;
  safeTx: SafeTxData;
  safeTxHash: string;
  senderAddress: string;
  senderSignature: string;
  origin?: string;
}): Promise<void> {
  const kit = getApiKit();
  // The Transaction Service requires EIP-55 checksummed addresses and rejects
  // lowercase ones with 422 "Checksum address validation failed" (api-kit
  // throws the same for safeAddress/senderAddress before the request even
  // leaves). Zhentan stores addresses lowercased for comparisons, so checksum
  // every address at this boundary. getAddress is idempotent on valid input.
  const payload = {
    safeAddress: getAddress(safeAddress as Address),
    safeTransactionData: {
      to: getAddress(safeTx.to as Address),
      value: safeTx.value,
      data: safeTx.data,
      operation: safeTx.operation,
      safeTxGas: safeTx.safeTxGas,
      baseGas: safeTx.baseGas,
      gasPrice: safeTx.gasPrice,
      gasToken: getAddress(safeTx.gasToken as Address),
      refundReceiver: getAddress(safeTx.refundReceiver as Address),
      nonce: safeTx.nonce,
    },
    safeTxHash,
    senderAddress: getAddress(senderAddress as Address),
    senderSignature,
    origin,
  };

  const delays = [0, 3000, 10_000];
  let lastError: unknown;
  for (const delay of delays) {
    if (delay) await sleep(delay);
    try {
      await kit.proposeTransaction(payload);
      return;
    } catch (err) {
      lastError = err;
      const msg = String(err);
      // Only the not-yet-indexed window is worth retrying.
      if (!/not indexed|does not exist|404|422/i.test(msg)) throw err;
    }
  }
  throw lastError;
}

/**
 * The multisig tx the Transaction Service has indexed as EXECUTED at a given
 * nonce, if any — the authoritative "who won this nonce slot" answer.
 *
 * Reading by nonce is race-free where inferring supersession from a nonce delta
 * is NOT: `getSafeInfo().nonce` can advance before the per-tx `isExecuted` flag
 * does (they are independently eventually-consistent), so "service nonce moved
 * past mine" does not imply "a different tx beat me". This reads the SAME
 * `isExecuted` index used to detect our own execution, so the two never
 * disagree. `null` when nothing at that nonce is indexed executed yet.
 */
export async function getExecutedTxAtNonce(
  safeAddress: string,
  nonce: number
): Promise<{
  safeTxHash: string;
  transactionHash: string | null;
  isSuccessful: boolean | null;
  executor: string | null;
} | null> {
  const res = await getApiKit().getMultisigTransactions(getAddress(safeAddress as Address), {
    nonce: String(nonce),
    executed: true,
  });
  const win = res.results?.[0];
  if (!win) return null;
  return {
    safeTxHash: win.safeTxHash,
    transactionHash: win.transactionHash ?? null,
    isSuccessful: win.isSuccessful ?? null,
    executor: win.executor ?? null,
  };
}

/**
 * Next unused nonce for proposals: the Transaction Service's queue-aware
 * value when the Safe is indexed, otherwise the on-chain nonce. An
 * undeployed (counterfactual) Safe always starts at nonce 0 — the service
 * 404s and an on-chain read would revert, but the first proposal is valid
 * (/queue lazily deploys before mirroring it).
 */
export async function getNextSafeNonce(safeAddress: string): Promise<number> {
  try {
    // Checksum required — api-kit throws "Checksum address validation failed"
    // on a lowercase address before hitting the service.
    const next = await getApiKit().getNextNonce(getAddress(safeAddress as Address));
    return Number(next);
  } catch {
    const code = await getRelayerPublicClient().getCode({
      address: safeAddress as Address,
    });
    if (!code || code === "0x") return 0;
    const kit = await getProtocolKit(safeAddress);
    return kit.getNonce();
  }
}
