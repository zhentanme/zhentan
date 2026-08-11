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

/**
 * D4: identity comes from AGENT_ADDRESS — the backend holds NO
 * threshold-bearing key; the runtime derives its address from its own key
 * and every sign-job result is checked against this value (signedBy +
 * recovered signature). E1 replaces the env value with the identity
 * registry. Deriving identity from AGENT_PRIVATE_KEY is permitted only
 * outside production, so accidental backend key retention never looks
 * valid.
 */
export function getAgentAddress(): `0x${string}` {
  if (agentAddress) return agentAddress;
  const configured = process.env.AGENT_ADDRESS;
  if (configured) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(configured)) {
      throw new Error("AGENT_ADDRESS is not a valid address");
    }
    agentAddress = configured as `0x${string}`;
    return agentAddress;
  }
  // Dev-only escape hatch — refused in production by design.
  if (process.env.NODE_ENV !== "production" && process.env.AGENT_PRIVATE_KEY) {
    console.warn(
      "WARNING: deriving agent identity from AGENT_PRIVATE_KEY (dev fallback). " +
        "Set AGENT_ADDRESS; the backend must not hold the agent key (D4)."
    );
    agentAddress = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`).address;
    return agentAddress;
  }
  throw new Error("Missing AGENT_ADDRESS (agent identity; the key lives in the runtime since D4)");
}
