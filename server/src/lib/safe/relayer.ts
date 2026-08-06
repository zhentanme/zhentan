/**
 * Chain read access and the agent's identity address.
 *
 * The wallet client that SENDS transactions (and the gas watchdog) live in
 * lib/chain/sponsor.ts — the sponsor role. What remains here is identity:
 * getAgentAddress() answers "which EOA is the agent owner on Safes", derived
 * from AGENT_PRIVATE_KEY alone, independent of who pays gas.
 */
import { createPublicClient, http, type PublicClient } from "viem";
import { bsc } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

import { BSC_RPC } from "../constants.js";

let publicClient: PublicClient | null = null;

export function getRelayerPublicClient(): PublicClient {
  if (!publicClient) {
    publicClient = createPublicClient({ chain: bsc, transport: http(BSC_RPC) });
  }
  return publicClient;
}

let agentAddress: `0x${string}` | null = null;

export function getAgentAddress(): `0x${string}` {
  if (agentAddress) return agentAddress;
  const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
  if (!agentPrivateKey) throw new Error("Missing AGENT_PRIVATE_KEY");
  agentAddress = privateKeyToAccount(agentPrivateKey as `0x${string}`).address;
  return agentAddress;
}
