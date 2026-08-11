/**
 * Chain reads for the signing authority (D4). Public chain state via RPC is
 * the runtime's ONLY external truth besides the Runtime API — owners,
 * threshold, and the current nonce are sourced HERE, never from the job
 * payload, so a compromised backend cannot fabricate an owner set.
 */
import { createPublicClient, http, parseAbi, type Address, type PublicClient } from "viem";

const SAFE_READ_ABI = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function nonce() view returns (uint256)",
]);

let client: PublicClient | null = null;

function rpc(): PublicClient {
  if (!client) {
    const url = process.env.RUNTIME_RPC_URL || "https://1rpc.io/bnb";
    client = createPublicClient({ transport: http(url) });
  }
  return client;
}

export interface SafeChainState {
  owners: string[];
  threshold: number;
  nonce: number;
}

export async function readSafeState(safeAddress: string): Promise<SafeChainState> {
  const address = safeAddress as Address;
  const [owners, threshold, nonce] = await Promise.all([
    rpc().readContract({ address, abi: SAFE_READ_ABI, functionName: "getOwners" }),
    rpc().readContract({ address, abi: SAFE_READ_ABI, functionName: "getThreshold" }),
    rpc().readContract({ address, abi: SAFE_READ_ABI, functionName: "nonce" }),
  ]);
  return {
    owners: owners.map((o) => o.toLowerCase()),
    threshold: Number(threshold),
    nonce: Number(nonce),
  };
}
