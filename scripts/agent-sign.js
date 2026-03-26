/**
 * Agent-side: Reads a pending transaction from the queue, co-signs with
 * the agent's key (owner 2), and submits to the bundler.
 *
 * Usage: node scripts/agent-sign.js <tx-id>
 * Env:   AGENT_PRIVATE_KEY (or PRIVATE_KEY2), PIMLICO_API_KEY
 */
import "dotenv/config";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { toSafeSmartAccount } from "permissionless/accounts";
import { SafeSmartAccount } from "permissionless/accounts/safe";
import {
  createPublicClient,
  http,
} from "viem";
import { bsc } from "viem/chains";
import { privateKeyToAccount, toAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { readFileSync, writeFileSync } from "fs";

const QUEUE_PATH =
  process.env.QUEUE_PATH ||
  "./pending-queue.json";

const SAFE_VERSION = "1.4.1";

// Must match propose-tx.js and the working multisig script
const SAFE_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const SAFE_PROXY_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";

/**
 * Restore BigInts from tagged strings and null → undefined
 * so the deserialized userOp exactly matches the original.
 */
function deserializeUserOp(raw) {
  const userOp = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string" && v.startsWith("bigint:")) {
      userOp[k] = BigInt(v.slice(7));
    } else if (v === null) {
      userOp[k] = undefined; // restore undefined fields (factory, factoryData, etc.)
    } else {
      userOp[k] = v;
    }
  }
  return userOp;
}

async function main() {
  const txId = process.argv[2];
  if (!txId) {
    console.error("Usage: node agent-sign.js <tx-id>");
    process.exit(1);
  }

  const agentKey = process.env.AGENT_PRIVATE_KEY || process.env.PRIVATE_KEY2;
  const pimlicoApiKey = process.env.PIMLICO_API_KEY;
  if (!agentKey) throw new Error("Missing AGENT_PRIVATE_KEY or PRIVATE_KEY2");
  if (!pimlicoApiKey) throw new Error("Missing PIMLICO_API_KEY");

  // 1. Read pending queue and find the transaction
  const queue = JSON.parse(readFileSync(QUEUE_PATH, "utf8"));
  const txIndex = queue.pending.findIndex((t) => t.id === txId);
  if (txIndex === -1) {
    console.error(JSON.stringify({ status: "not_found", message: `${txId} not in queue` }));
    process.exit(1);
  }
  const tx = queue.pending[txIndex];
  if (tx.executedAt) {
    console.log(JSON.stringify({ status: "already_executed", txHash: tx.txHash }));
    process.exit(0);
  }
  if (!tx.userOp || !tx.partialSignatures) {
    console.error(JSON.stringify({ status: "error", message: "Missing userOp or partialSignatures" }));
    process.exit(1);
  }

  const agentAccount = privateKeyToAccount(agentKey);
  const owners = tx.ownerAddresses.map((addr) => toAccount(addr));
  const userOp = deserializeUserOp(tx.userOp);

  console.log(userOp);

  console.log(`Co-signing ${txId}: ${tx.amount} ${tx.token} -> ${tx.to}`);

  // 2. Reconstruct Safe account with the SAME contract addresses as propose-tx.js
  const publicClient = createPublicClient({
    chain: bsc,
    transport: http("https://1rpc.io/bnb"),
  });

  const paymasterClient = createPimlicoClient({
    transport: http(
      `https://api.pimlico.io/v2/binance/rpc?apikey=${pimlicoApiKey}`
    ),
    entryPoint: { address: entryPoint07Address, version: "0.7" },
  });

  const safeAccount = await toSafeSmartAccount({
    client: publicClient,
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    owners,
    saltNonce: 0n,
    safeSingletonAddress: SAFE_SINGLETON,
    safeProxyFactoryAddress: SAFE_PROXY_FACTORY,
    version: SAFE_VERSION,
    threshold: BigInt(tx.threshold),
  });

  const smartAccountClient = createSmartAccountClient({
    account: safeAccount,
    chain: bsc,
    paymaster: paymasterClient,
    bundlerTransport: http(
      `https://api.pimlico.io/v2/binance/rpc?apikey=${pimlicoApiKey}`
    ),
    userOperation: {
      estimateFeesPerGas: async () =>
        (await paymasterClient.getUserOperationGasPrice()).fast,
    },
  });

  // 3. Agent co-signs on top of owner's partial signature
  //    Mirror the working script: spread userOp, then set signatures AFTER
  //    (so userOp's stale 'signature' key doesn't shadow 'signatures')
  const signParams = {
    version: SAFE_VERSION,
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    chainId: bsc.id,
    owners,
    account: agentAccount,
    ...userOp,
  };
  signParams.signatures = tx.partialSignatures;

  const combinedSignatures = await SafeSmartAccount.signUserOperation(signParams);

  console.log("Agent signature added:", agentAccount.address);

  // 4. Submit — use combinedSignatures directly (same as working script)
  const userOpHash = await smartAccountClient.sendUserOperation({
    ...userOp,
    signature: combinedSignatures,
  });

  console.log("UserOperation hash:", userOpHash);

  const receipt = await smartAccountClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log("Success:", receipt.success);
  const txHash = receipt.receipt?.transactionHash;
  if (txHash) console.log("Transaction hash:", txHash);

  // 5. Update queue with result
  tx.executedAt = new Date().toISOString();
  tx.executedBy = agentAccount.address;
  tx.txHash = txHash || userOpHash;
  tx.success = receipt.success;
  queue.pending[txIndex] = tx;
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));

  // Output JSON for the OpenClaw agent to parse
  console.log(
    JSON.stringify({
      status: "executed",
      txId: tx.id,
      to: tx.to,
      amount: tx.amount,
      token: tx.token,
      txHash: tx.txHash,
      success: receipt.success,
    })
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ status: "error", message: err.message }));
  process.exit(1);
});
