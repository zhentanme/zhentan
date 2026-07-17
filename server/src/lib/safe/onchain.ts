/**
 * Direct on-chain Safe reads (owners, threshold, nonce) via the shared
 * relayer public client.
 */
import type { Address } from "viem";

import { SAFE_ABI } from "../constants.js";
import { getRelayerPublicClient } from "./relayer.js";

export async function readSafeOwners(safeAddress: string): Promise<string[]> {
  const owners = await getRelayerPublicClient().readContract({
    address: safeAddress as Address,
    abi: SAFE_ABI,
    functionName: "getOwners",
  });
  return [...owners];
}

export async function readSafeThreshold(safeAddress: string): Promise<number> {
  const threshold = await getRelayerPublicClient().readContract({
    address: safeAddress as Address,
    abi: SAFE_ABI,
    functionName: "getThreshold",
  });
  return Number(threshold);
}

export async function readSafeNonce(safeAddress: string): Promise<number> {
  const nonce = await getRelayerPublicClient().readContract({
    address: safeAddress as Address,
    abi: SAFE_ABI,
    functionName: "nonce",
  });
  return Number(nonce);
}
