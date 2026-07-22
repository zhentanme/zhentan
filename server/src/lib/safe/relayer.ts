/**
 * Agent EOA as relayer: wallet client (with nonce management) for Safe
 * deployments and execTransaction relaying, plus a gas watchdog.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Transport,
  type Account,
} from "viem";
import { bsc } from "viem/chains";
import { privateKeyToAccount, nonceManager } from "viem/accounts";

import { BSC_RPC } from "../constants.js";
import { notifyTelegram } from "../../notify.js";

let publicClient: PublicClient | null = null;
let walletClient: WalletClient<Transport, Chain, Account> | null = null;

export function getRelayerPublicClient(): PublicClient {
  if (!publicClient) {
    publicClient = createPublicClient({ chain: bsc, transport: http(BSC_RPC) });
  }
  return publicClient;
}

export function getAgentWalletClient(): WalletClient<Transport, Chain, Account> {
  if (walletClient) return walletClient;
  const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
  if (!agentPrivateKey) throw new Error("Missing AGENT_PRIVATE_KEY");
  // nonceManager serializes concurrent sends (deploys + executes share one EOA).
  const account = privateKeyToAccount(agentPrivateKey as `0x${string}`, {
    nonceManager,
  });
  walletClient = createWalletClient({
    account,
    chain: bsc,
    transport: http(BSC_RPC),
  });
  return walletClient;
}

export function getAgentAddress(): `0x${string}` {
  return getAgentWalletClient().account.address;
}

let lastLowGasAlert = 0;
const LOW_GAS_ALERT_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Checks the agent EOA's BNB balance against AGENT_MIN_BNB (default 0.05).
 * Below the threshold it alerts the admin Telegram chat (throttled to 1/hour)
 * but does NOT throw — a low-but-nonzero balance can still relay.
 */
export async function assertAgentGas(): Promise<void> {
  try {
    const minBnb = process.env.AGENT_MIN_BNB || "0.05";
    const balance = await getRelayerPublicClient().getBalance({
      address: getAgentAddress(),
    });
    if (balance >= parseEther(minBnb)) return;

    console.warn(
      `Agent relayer low on gas: ${formatEther(balance)} BNB (min ${minBnb})`
    );
    const now = Date.now();
    if (now - lastLowGasAlert < LOW_GAS_ALERT_INTERVAL_MS) return;
    lastLowGasAlert = now;
    notifyTelegram(
      `⛽ Agent relayer low on gas: ${formatEther(balance)} BNB ` +
        `(threshold ${minBnb} BNB).\n` +
        `Top up ${getAgentAddress()} or SafeTx execution will stall.`
    );
  } catch (err) {
    console.error("assertAgentGas failed:", err);
  }
}
