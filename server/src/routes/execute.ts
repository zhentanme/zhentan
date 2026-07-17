import { Router, Request, Response, type IRouter } from "express";
import { createPublicClient, http, type Hex } from "viem";
import { bsc } from "viem/chains";
import { privateKeyToAccount, toAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { toSafeSmartAccount } from "permissionless/accounts";
import { SafeSmartAccount } from "permissionless/accounts/safe";
import { EthSafeSignature } from "@safe-global/protocol-kit";
import {
  SAFE_SINGLETON,
  SAFE_PROXY_FACTORY,
  SAFE_VERSION,
  BSC_RPC,
  getPimlicoRpcUrl,
} from "../lib/constants.js";
import { deserializeUserOp } from "../lib/serialize.js";
import {
  getTransaction,
  getLastInReviewTransaction,
  updateTransaction,
  updatePatternsAfterExecution,
  recordTxOutcome,
  getUserDetails,
  getUserByAddress,
} from "../lib/supabase/index.js";
import { getSafeAddressFromCallerId } from "../lib/caller.js";
import { notify } from "../notifications/index.js";
import { getApiKit, getProtocolKit } from "../lib/safe/service.js";
import { readSafeNonce } from "../lib/safe/onchain.js";
import { assertAgentGas, getAgentAddress, getRelayerPublicClient } from "../lib/safe/relayer.js";
import type { PendingTransaction } from "../types.js";

interface ExecutionOutcome {
  status: "executed" | "already_executed" | "superseded";
  txHash?: string;
  success?: boolean;
  executedBy?: string;
  reason?: string;
}

/**
 * Shared post-execution bookkeeping for both flows: persist the outcome,
 * learn patterns, and notify sender + (Zhentan) recipient.
 */
export async function finishExecution(
  tx: PendingTransaction,
  txHash: string,
  success: boolean,
  executedBy: string
): Promise<void> {
  const executedTx = {
    ...tx,
    inReview: false,
    executedAt: new Date().toISOString(),
    executedBy,
    txHash,
    success,
  };

  await updateTransaction(tx.id, {
    inReview: false,
    executedAt: executedTx.executedAt,
    executedBy,
    txHash,
    success,
  });

  // Fire-and-forget: learn from execution and notify the user
  Promise.all([
    updatePatternsAfterExecution(executedTx),
    recordTxOutcome(executedTx, "auto_approved", {
      riskScore: tx.riskScore,
      riskVerdict: tx.riskVerdict,
      riskReasons: tx.riskReasons,
    }),
    getUserDetails(tx.safeAddress).then((user) => {
      if (!user) return;
      return notify("tx_sent", user, {
        txId: tx.id,
        amount: tx.amount,
        token: tx.token || "USDC",
        tokenLogoUrl: tx.tokenIconUrl ?? undefined,
        amountUsd: tx.amountUSD ? `$${tx.amountUSD}` : undefined,
        toAddress: tx.to,
        txHash: String(txHash),
        riskScore: tx.riskScore ?? undefined,
        autoApproved: tx.riskVerdict === "APPROVE",
      });
    }),
    getUserByAddress(tx.to).then((recipient) => {
      if (!recipient) return;
      // Skip if sender and recipient are the same Safe
      if (recipient.safe_address.toLowerCase() === tx.safeAddress.toLowerCase()) return;
      return notify("tx_received", recipient, {
        amount: tx.amount,
        token: tx.token || "USDC",
        tokenLogoUrl: tx.tokenIconUrl ?? undefined,
        amountUsd: tx.amountUSD ? `$${tx.amountUSD}` : undefined,
        fromAddress: tx.safeAddress,
        txHash: String(txHash),
      });
    }),
  ]).catch((err) => console.error("Post-execute tasks failed:", err));
}

/** Legacy gasless flow: agent co-signs the userOp and submits via Pimlico. */
async function executeLegacy4337(tx: PendingTransaction): Promise<ExecutionOutcome> {
  const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
  const pimlicoApiKey = process.env.PIMLICO_API_KEY;
  if (!agentPrivateKey) throw new Error("Missing AGENT_PRIVATE_KEY");
  if (!pimlicoApiKey) throw new Error("Missing PIMLICO_API_KEY");
  if (!tx.userOp || !tx.partialSignatures) {
    throw new Error("Missing userOp or partialSignatures");
  }

  const agentAccount = privateKeyToAccount(agentPrivateKey as `0x${string}`);
  const owners = tx.ownerAddresses.map((addr) => toAccount(addr as `0x${string}`));
  const userOp = deserializeUserOp(tx.userOp);

  const publicClient = createPublicClient({
    chain: bsc,
    transport: http(BSC_RPC),
  });

  const paymasterClient = createPimlicoClient({
    transport: http(getPimlicoRpcUrl(pimlicoApiKey)),
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
    // Pin the stored address: an upgraded Safe's on-chain owner set no longer
    // matches the initializer its address was derived from.
    address: tx.safeAddress as `0x${string}`,
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

  const signParams: Record<string, unknown> = {
    version: SAFE_VERSION,
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    chainId: bsc.id,
    owners,
    account: agentAccount,
    ...userOp,
  };
  signParams.signatures = tx.partialSignatures;

  const combinedSignatures = await SafeSmartAccount.signUserOperation(
    signParams as Parameters<typeof SafeSmartAccount.signUserOperation>[0]
  );

  const userOpHash = await smartAccountClient.sendUserOperation({
    ...userOp,
    signature: combinedSignatures,
  } as Parameters<typeof smartAccountClient.sendUserOperation>[0]);

  const receipt = await smartAccountClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  const txHash = receipt.receipt?.transactionHash ?? userOpHash;
  return {
    status: "executed",
    txHash,
    success: receipt.success,
    executedBy: agentAccount.address,
  };
}

/**
 * SafeTx flow: agent confirms via the Transaction Service and relays
 * execTransaction (agent EOA pays gas).
 */
async function executeSafeTx(tx: PendingTransaction): Promise<ExecutionOutcome> {
  if (!tx.safeTxHash || !tx.safeTx || tx.safeNonce === undefined || !tx.userSignature) {
    throw new Error("Missing SafeTx fields (safeTxHash/safeTx/safeNonce/userSignature)");
  }

  await assertAgentGas();

  // Nonce race guard: the user may have executed something at this nonce
  // directly from the Safe UI while this proposal waited. That "something"
  // may be THIS very SafeTx (the override path) — check before writing it
  // off as superseded, or a successful transfer gets recorded as rejected.
  const onChainNonce = await readSafeNonce(tx.safeAddress);
  if (onChainNonce > tx.safeNonce) {
    try {
      const executedTx = await getApiKit().getTransaction(tx.safeTxHash);
      if (executedTx.isExecuted) {
        return {
          status: "already_executed",
          txHash: executedTx.transactionHash ?? undefined,
          success: executedTx.isSuccessful ?? undefined,
          executedBy: executedTx.executor ?? undefined,
        };
      }
    } catch {
      // Not in the service — genuinely superseded by a different tx.
    }
    await updateTransaction(tx.id, {
      rejected: true,
      rejectedAt: new Date().toISOString(),
      rejectReason: "Superseded: Safe nonce already consumed on-chain",
      inReview: false,
    });
    return { status: "superseded", reason: "Safe nonce already consumed on-chain" };
  }

  const protocolKit = await getProtocolKit(tx.safeAddress);
  const agentSignature = await protocolKit.signHash(tx.safeTxHash);

  // Confirm via the service so the Safe UI shows 2/2 — idempotent, and a
  // service outage must not block execution (we can assemble both
  // signatures locally).
  let serviceTx: Awaited<ReturnType<ReturnType<typeof getApiKit>["getTransaction"]>> | null = null;
  try {
    const apiKit = getApiKit();
    try {
      await apiKit.confirmTransaction(tx.safeTxHash, agentSignature.data);
    } catch (err) {
      if (!/already/i.test(String(err))) throw err;
    }
    serviceTx = await apiKit.getTransaction(tx.safeTxHash);
  } catch (err) {
    console.error("Transaction Service unavailable during execute (continuing local):", err);
  }

  if (serviceTx?.isExecuted) {
    return {
      status: "already_executed",
      txHash: serviceTx.transactionHash ?? undefined,
      success: serviceTx.isSuccessful ?? undefined,
      executedBy: serviceTx.executor ?? undefined,
    };
  }

  // Idempotency: re-read right before sending — /queue auto-execute,
  // Telegram and MCP can race, and a double execTransaction at one nonce
  // burns gas on a revert.
  const fresh = await getTransaction(tx.id);
  if (fresh?.executedAt) {
    return { status: "already_executed", txHash: fresh.txHash, success: fresh.success };
  }

  let txHash: string;
  if (serviceTx) {
    const result = await protocolKit.executeTransaction(serviceTx);
    txHash = result.hash;
  } else {
    // Local assembly fallback: user signature from the proposal + fresh
    // agent signature over the same hash.
    const safeTransaction = await protocolKit.createTransaction({
      transactions: [
        {
          to: tx.safeTx.to,
          value: tx.safeTx.value,
          data: tx.safeTx.data,
          operation: tx.safeTx.operation,
        },
      ],
      options: {
        safeTxGas: tx.safeTx.safeTxGas,
        baseGas: tx.safeTx.baseGas,
        gasPrice: tx.safeTx.gasPrice,
        gasToken: tx.safeTx.gasToken,
        refundReceiver: tx.safeTx.refundReceiver,
        nonce: tx.safeNonce,
      },
    });
    safeTransaction.addSignature(new EthSafeSignature(tx.proposedBy, tx.userSignature as Hex));
    safeTransaction.addSignature(agentSignature);
    const result = await protocolKit.executeTransaction(safeTransaction);
    txHash = result.hash;
  }

  const receipt = await getRelayerPublicClient().waitForTransactionReceipt({
    hash: txHash as Hex,
  });

  return {
    status: "executed",
    txHash,
    success: receipt.status === "success",
    executedBy: getAgentAddress(),
  };
}

// Per-tx in-flight guard against concurrent execute calls in this process.
const inFlight = new Set<string>();

export function createExecuteRouter(): IRouter {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    let txId: string | undefined;
    try {
      const { txId: rawTxId, callerId } = req.body ?? {};

      txId = rawTxId;
      if (!txId) {
        const safeAddress = await getSafeAddressFromCallerId(callerId);
        if (!safeAddress) {
          res.status(400).json({ error: "Missing txId and could not resolve Safe from callerId" });
          return;
        }
        const latest = await getLastInReviewTransaction(safeAddress);
        if (!latest) {
          res.status(404).json({ error: "No in-review transaction found for this Safe" });
          return;
        }
        txId = latest.id;
      }

      const tx = await getTransaction(txId);
      if (!tx) {
        res.status(404).json({ error: `Transaction ${txId} not found` });
        return;
      }

      if (tx.rejected) {
        res.json({ status: "already_rejected" });
        return;
      }

      if (tx.executedAt) {
        res.json({ status: "already_executed", txHash: tx.txHash });
        return;
      }

      if (inFlight.has(txId)) {
        res.status(409).json({ status: "in_progress", txId });
        return;
      }
      inFlight.add(txId);

      let outcome: ExecutionOutcome;
      try {
        outcome =
          tx.txType === "safetx"
            ? await executeSafeTx(tx)
            : await executeLegacy4337(tx);
      } finally {
        inFlight.delete(txId);
      }

      if (outcome.status === "superseded") {
        res.json({ status: "superseded", txId: tx.id, reason: outcome.reason });
        return;
      }

      if (outcome.status === "already_executed") {
        if (outcome.txHash && !tx.executedAt) {
          await finishExecution(
            tx,
            outcome.txHash,
            outcome.success ?? true,
            outcome.executedBy ?? getAgentAddress()
          );
        }
        res.json({ status: "already_executed", txId: tx.id, txHash: outcome.txHash });
        return;
      }

      await finishExecution(
        tx,
        outcome.txHash!,
        outcome.success ?? true,
        outcome.executedBy ?? getAgentAddress()
      );

      res.json({
        status: "executed",
        txId: tx.id,
        to: tx.to,
        amount: tx.amount,
        token: tx.token,
        txHash: outcome.txHash,
        success: outcome.success,
      });
    } catch (err) {
      if (txId) inFlight.delete(txId);
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Execute error:", message);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
