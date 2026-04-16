import { Router, Request, Response, type IRouter } from "express";
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
import { privateKeyToAccount, toAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { toSafeSmartAccount } from "permissionless/accounts";
import { SafeSmartAccount } from "permissionless/accounts/safe";
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
} from "../lib/supabase/index.js";
import { getSafeAddressFromCallerId } from "../lib/caller.js";

export function createExecuteRouter(): IRouter {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    try {
      const { txId: rawTxId, callerId } = req.body ?? {};

      let txId = rawTxId;
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

      const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
      const pimlicoApiKey = process.env.PIMLICO_API_KEY;

      if (!agentPrivateKey) {
        res.status(500).json({ error: "Missing AGENT_PRIVATE_KEY" });
        return;
      }
      if (!pimlicoApiKey) {
        res.status(500).json({ error: "Missing PIMLICO_API_KEY" });
        return;
      }

      const tx = await getTransaction(txId);
      if (!tx) {
        res.status(404).json({ error: `Transaction ${txId} not found` });
        return;
      }

      if(tx.rejected) {
        res.json({ status: "already_rejected"});
        return;
      }

      if (tx.executedAt) {
        res.json({ status: "already_executed", txHash: tx.txHash });
        return;
      }

      if (!tx.userOp || !tx.partialSignatures) {
        res.status(400).json({ error: "Missing userOp or partialSignatures" });
        return;
      }

      const agentAccount = privateKeyToAccount(agentPrivateKey as `0x${string}`);
      const owners = tx.ownerAddresses.map((addr) =>
        toAccount(addr as `0x${string}`)
      );
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

      const executedTx = {
        ...tx,
        inReview: false,
        executedAt: new Date().toISOString(),
        executedBy: agentAccount.address,
        txHash,
        success: receipt.success,
      };

      await updateTransaction(txId, {
        inReview: false,
        executedAt: executedTx.executedAt,
        executedBy: executedTx.executedBy,
        txHash,
        success: receipt.success,
      });

      // Fire-and-forget: learn from this execution (don't block the response)
      Promise.all([
        updatePatternsAfterExecution(executedTx),
        recordTxOutcome(executedTx, "auto_approved", {
          riskScore: tx.riskScore,
          riskVerdict: tx.riskVerdict,
          riskReasons: tx.riskReasons,
        }),
      ]).catch((err) => console.error("Pattern update failed:", err));

      res.json({
        status: "executed",
        txId: tx.id,
        to: tx.to,
        amount: tx.amount,
        token: tx.token,
        txHash,
        success: receipt.success,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Execute error:", message);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
