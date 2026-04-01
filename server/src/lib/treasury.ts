/**
 * Treasury Safe — a server-controlled 3-owner / threshold-1 Safe used to
 * distribute campaign rewards and other server-initiated payouts.
 *
 * Owners:
 *   [0] Server signer  — TREASURY_PRIVATE_KEY  (LocalAccount, signs autonomously)
 *   [1] External signer 1 — TREASURY_SIGNER_1   (address-only, for manual recovery)
 *   [2] External signer 2 — TREASURY_SIGNER_2   (address-only, for manual recovery)
 *
 * Threshold: 1  →  server can act alone; external owners provide recovery paths.
 * Salt nonce: 1n to distinguish from user Safes (which use 0n).
 */
import {
  createPublicClient,
  http,
  parseUnits,
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import { bsc } from "viem/chains";
import { privateKeyToAccount, toAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { toSafeSmartAccount } from "permissionless/accounts";
import {
  SAFE_SINGLETON,
  SAFE_PROXY_FACTORY,
  SAFE_VERSION,
  BSC_RPC,
  getPimlicoRpcUrl,
  ERC20_TRANSFER_ABI,
  NATIVE_TOKEN_ADDRESS,
} from "./constants.js";

const TREASURY_SALT_NONCE = 1n;

// ─── Config ──────────────────────────────────────────────────────────────────

function getConfig() {
  const privateKey = process.env.TREASURY_PRIVATE_KEY;
  const signer1 = process.env.TREASURY_SIGNER_1;
  const signer2 = process.env.TREASURY_SIGNER_2;
  const pimlicoApiKey = process.env.PIMLICO_API_KEY;
  const RPC_URL = process.env.BSC_RPC_URL ?? BSC_RPC;

  if (!privateKey) throw new Error("Missing env var: TREASURY_PRIVATE_KEY");
  if (!signer1) throw new Error("Missing env var: TREASURY_SIGNER_1");
  if (!signer2) throw new Error("Missing env var: TREASURY_SIGNER_2");
  if (!pimlicoApiKey) throw new Error("Missing env var: PIMLICO_API_KEY");

  return { privateKey: privateKey as Hex, signer1: signer1 as Address, signer2: signer2 as Address, pimlicoApiKey, rpcUrl: RPC_URL };
}

// ─── Internal client builder ──────────────────────────────────────────────────

async function buildClients() {
  const { privateKey, signer1, signer2, pimlicoApiKey, rpcUrl } = getConfig();

  // First owner is the LocalAccount that will sign autonomously.
  // External signers are address-only (toAccount) for Safe owner registration.
  const serverAccount = privateKeyToAccount(privateKey);
  const owners = [
    serverAccount,
    toAccount(signer1),
    toAccount(signer2),
  ] as const;

  const publicClient = createPublicClient({
    chain: bsc,
    transport: http(rpcUrl),
  });

  const paymasterClient = createPimlicoClient({
    transport: http(getPimlicoRpcUrl(pimlicoApiKey)),
    entryPoint: { address: entryPoint07Address, version: "0.7" },
  });

  const safeAccount = await toSafeSmartAccount({
    client: publicClient,
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    owners,
    saltNonce: TREASURY_SALT_NONCE,
    safeSingletonAddress: SAFE_SINGLETON,
    safeProxyFactoryAddress: SAFE_PROXY_FACTORY,
    version: SAFE_VERSION,
    threshold: 1n,
  });

  const smartAccountClient = createSmartAccountClient({
    account: safeAccount,
    chain: bsc,
    paymaster: paymasterClient,
    bundlerTransport: http(getPimlicoRpcUrl(pimlicoApiKey)),
    userOperation: {
      estimateFeesPerGas: async () =>
        (await paymasterClient.getUserOperationGasPrice()).fast,
    },
  });

  return { safeAccount, smartAccountClient };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the deterministic address of the treasury Safe.
 * The Safe is not deployed until the first transaction is sent.
 */
export async function getTreasurySafeAddress(): Promise<Address> {
  const { safeAccount } = await buildClients();
  return safeAccount.address;
}

/**
 * Sends `amount` of a token from the treasury Safe to `to`.
 *
 * @param to          Recipient address
 * @param tokenAddress ERC-20 contract address, or NATIVE_TOKEN_ADDRESS for BNB
 * @param amount      Human-readable amount (e.g. "10" for 10 tokens)
 * @param decimals    Token decimals
 * @returns           On-chain transaction hash
 */
export async function sendTokenFromTreasury(
  to: Address,
  tokenAddress: Address,
  amount: string,
  decimals: number
): Promise<Hex> {
  const { smartAccountClient } = await buildClients();

  const amountWei = parseUnits(amount, decimals);
  const isNative =
    tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();

  const calls = isNative
    ? [{ to, value: amountWei, data: "0x" as Hex }]
    : [
        {
          to: tokenAddress,
          value: 0n,
          data: encodeFunctionData({
            abi: ERC20_TRANSFER_ABI,
            functionName: "transfer",
            args: [to, amountWei],
          }),
        },
      ];

  const userOpHash = await smartAccountClient.sendUserOperation({ calls });
  const receipt = await smartAccountClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  return receipt.receipt.transactionHash;
}
