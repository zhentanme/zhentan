/**
 * The gas sponsor: the EOA that SENDS transactions and pays BNB gas — Safe
 * deployments today, execTransaction relaying once sign/send are separated
 * (B1/B2). Distinct in name from the agent signer (lib/agent/signer.ts),
 * whose key is threshold-bearing; the sponsor's never is.
 *
 * Defaults to the agent key (SPONSOR_PRIVATE_KEY ?? AGENT_PRIVATE_KEY);
 * since B1/B2 every EOA send goes through this wallet, so a distinct
 * sponsor key is fully supported.
 *
 * Nonce serialization lives here with the sender: viem's in-process
 * nonceManager is correct while exactly ONE process sends (see plan D0.1 —
 * sponsor sends must stay single-process until a DB-backed queue exists).
 */
import {
  createWalletClient,
  http,
  formatEther,
  parseEther,
  type WalletClient,
  type Chain,
  type Transport,
  type Account,
} from "viem";
import { bsc } from "viem/chains";
import { privateKeyToAccount, nonceManager } from "viem/accounts";

import { BSC_RPC } from "../constants.js";
import { notifyTelegram } from "../../notify.js";
import { getRelayerPublicClient } from "../safe/relayer.js";

/** Pure resolution — exported for tests. */
export function resolveSponsorPrivateKey(
  env: { SPONSOR_PRIVATE_KEY?: string; AGENT_PRIVATE_KEY?: string } = process.env
): string {
  const key = env.SPONSOR_PRIVATE_KEY || env.AGENT_PRIVATE_KEY;
  if (!key) throw new Error("Missing SPONSOR_PRIVATE_KEY and AGENT_PRIVATE_KEY");
  return key;
}

let walletClient: WalletClient<Transport, Chain, Account> | null = null;

export function getSponsorWalletClient(): WalletClient<Transport, Chain, Account> {
  if (walletClient) return walletClient;
  // nonceManager serializes concurrent sends (deploys + executes share one EOA).
  const account = privateKeyToAccount(resolveSponsorPrivateKey() as `0x${string}`, {
    nonceManager,
  });
  walletClient = createWalletClient({
    account,
    chain: bsc,
    transport: http(BSC_RPC),
  });
  return walletClient;
}

export function getSponsorAddress(): `0x${string}` {
  return getSponsorWalletClient().account.address;
}

let lastLowGasAlert = 0;
const LOW_GAS_ALERT_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Checks the sponsor EOA's BNB balance against AGENT_MIN_BNB (default 0.05).
 * Below the threshold it alerts the admin Telegram chat (throttled to 1/hour)
 * but does NOT throw — a low-but-nonzero balance can still relay.
 */
export async function assertSponsorGas(): Promise<void> {
  try {
    const minBnb = process.env.AGENT_MIN_BNB || "0.05";
    const balance = await getRelayerPublicClient().getBalance({
      address: getSponsorAddress(),
    });
    if (balance >= parseEther(minBnb)) return;

    console.warn(
      `Sponsor relayer low on gas: ${formatEther(balance)} BNB (min ${minBnb})`
    );
    const now = Date.now();
    if (now - lastLowGasAlert < LOW_GAS_ALERT_INTERVAL_MS) return;
    lastLowGasAlert = now;
    notifyTelegram(
      `⛽ Agent relayer low on gas: ${formatEther(balance)} BNB ` +
        `(threshold ${minBnb} BNB).\n` +
        `Top up ${getSponsorAddress()} or SafeTx execution will stall.`
    );
  } catch (err) {
    console.error("assertSponsorGas failed:", err);
  }
}
