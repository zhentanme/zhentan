/**
 * Owner-side: Prepares a USDC transfer userOp, signs with owner key,
 * and stores it in the Zhentan pending queue for the agent to co-sign.
 *
 * Usage: node scripts/propose-tx.js
 * Env:   PRIVATE_KEY (owner 1), OWNER_ADDRESS1, OWNER_ADDRESS2,
 *        PIMLICO_API_KEY, RECIPIENT_ADDRESS, USDC_AMOUNT, USDC_CONTRACT_ADDRESS
 */
import "dotenv/config";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { toSafeSmartAccount } from "permissionless/accounts";
import { SafeSmartAccount } from "permissionless/accounts/safe";
import {
  createPublicClient,
  http,
  parseUnits,
  encodeFunctionData,
} from "viem";
import { bsc } from "viem/chains";
import { privateKeyToAccount, toAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";

const QUEUE_PATH =
  process.env.QUEUE_PATH ||
  "./pending-queue.json";

const DEFAULT_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const USDC_DECIMALS = 6;
const SAFE_VERSION = "1.4.1";

// Must match the working multisig script exactly
const SAFE_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const SAFE_PROXY_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";

const erc20TransferAbi = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
];

/**
 * Convert all BigInts to tagged strings and undefined to null
 * so we can round-trip through JSON without losing any fields.
 */
function serializeUserOp(userOp) {
  const out = {};
  for (const [k, v] of Object.entries(userOp)) {
    if (typeof v === "bigint") {
      out[k] = `bigint:${v.toString()}`;
    } else if (v === undefined) {
      out[k] = null; // JSON has no undefined — use null as marker
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function main() {
  const pimlicoApiKey = process.env.PIMLICO_API_KEY;
  const recipient = process.env.RECIPIENT_ADDRESS;
  const amountHuman = process.env.USDC_AMOUNT ?? "1";
  const usdcAddress = process.env.USDC_CONTRACT_ADDRESS ?? DEFAULT_USDC;
  const ownerAddr1 = process.env.OWNER_ADDRESS1;
  const ownerAddr2 = process.env.OWNER_ADDRESS2;
  const threshold = parseInt(process.env.SAFE_THRESHOLD || "2", 10);

  if (!pimlicoApiKey) throw new Error("Missing PIMLICO_API_KEY");
  if (!recipient?.startsWith("0x")) throw new Error("Missing RECIPIENT_ADDRESS");
  if (!ownerAddr1 || !ownerAddr2) throw new Error("Missing OWNER_ADDRESS1 / OWNER_ADDRESS2");
  if (!process.env.PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY (owner signer)");

  const ownerAccount = privateKeyToAccount(process.env.PRIVATE_KEY);
  const owners = [toAccount(ownerAddr1), toAccount(ownerAddr2)];

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
    threshold: BigInt(threshold),
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

  const amountWei = parseUnits(amountHuman, USDC_DECIMALS);
  const data = encodeFunctionData({
    abi: erc20TransferAbi,
    functionName: "transfer",
    args: [recipient, amountWei],
  });

  console.log("Safe account:", safeAccount.address);
  console.log("Preparing userOp:", amountHuman, "USDC ->", recipient);

  // 1. Prepare unsigned user operation (talks to bundler/paymaster for gas estimates)
  const unsignedUserOp = await smartAccountClient.prepareUserOperation({
    calls: [{ to: usdcAddress, value: 0n, data }],
  });

  console.log(unsignedUserOp);
  // 2. Owner signs their part
  const partialSignatures = await SafeSmartAccount.signUserOperation({
    version: SAFE_VERSION,
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    chainId: bsc.id,
    owners,
    account: ownerAccount,
    ...unsignedUserOp,
  });

  console.log("Owner signature collected:", ownerAccount.address);

  // 3. Write to pending queue for agent pickup
  const txId = `tx-${randomUUID().slice(0, 8)}`;
  const pendingTx = {
    id: txId,
    to: recipient,
    amount: amountHuman,
    token: "USDC",
    usdcAddress,
    proposedBy: ownerAccount.address,
    signatures: [ownerAccount.address],
    ownerAddresses: [ownerAddr1, ownerAddr2],
    threshold,
    safeAddress: safeAccount.address,
    userOp: serializeUserOp(unsignedUserOp),
    partialSignatures,
    proposedAt: new Date().toISOString(),
  };

  let queue;
  try {
    queue = JSON.parse(readFileSync(QUEUE_PATH, "utf8"));
  } catch {
    queue = { pending: [] };
  }
  queue.pending.push(pendingTx);
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));

  console.log(`\nTransaction proposed: ${txId}`);
  console.log(`Stored in: ${QUEUE_PATH}`);
  console.log("Waiting for Zhentan agent to analyze and co-sign...");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
