import { Router, Request, Response, type IRouter } from "express";
import { decodeFunctionData, isAddressEqual, type Address, type Hex } from "viem";
import { analyzeRisk } from "../risk.js";
import { notifyTelegram } from "../notify.js";
import {
  createTransaction,
  updateTransaction,
  getPatternsForSafe,
  getTelegramChatId,
  getUserDetails,
  upsertUserDetails,
  recordTxOutcome,
  incrementDailyStatsReview,
} from "../lib/supabase/index.js";
import { notify } from "../notifications/index.js";
import { SAFE_ABI } from "../lib/constants.js";
import {
  computeSafeTxHash,
  recoverSafeTxSigner,
  proposeToService,
} from "../lib/safe/service.js";
import { deploySafe, isSafeDeployed } from "../lib/safe/deploy.js";
import { DERIVATION_V1_4337, type DerivationVersion } from "../lib/safe/derive.js";
import { getAgentAddress } from "../lib/safe/relayer.js";
import { readSafeOwners } from "../lib/safe/onchain.js";
import type { PendingTransaction, SafeTxData } from "../types.js";

/**
 * Validates a client-submitted SafeTx proposal. The client's hash is never
 * trusted — we recompute it from the raw fields — and both signatures must
 * recover to a non-agent owner of this Safe (otherwise /queue would be a
 * signature oracle for arbitrary payloads).
 */
async function validateSafeTxProposal(pendingTx: PendingTransaction): Promise<void> {
  const { safeTx, safeTxHash, safeNonce, userSignature, rejectionSignature, safeAddress } =
    pendingTx;
  if (!safeTx || !safeTxHash || safeNonce === undefined || !userSignature || !rejectionSignature) {
    throw new Error(
      "SafeTx proposal requires safeTx, safeTxHash, safeNonce, userSignature, rejectionSignature"
    );
  }
  if (safeTx.nonce !== safeNonce) {
    throw new Error("safeTx.nonce does not match safeNonce");
  }

  const computedHash = computeSafeTxHash(safeAddress, safeTx);
  if (computedHash.toLowerCase() !== safeTxHash.toLowerCase()) {
    throw new Error("safeTxHash does not match the SafeTx contents");
  }

  // The owner set must come from the server-side record — proposals are only
  // possible after the sync that creates it, so a missing record means the
  // caller is spoofing a Safe they never registered.
  const record = await getUserDetails(safeAddress);
  if (!record) {
    throw new Error("Unknown Safe — complete onboarding before proposing");
  }
  const agent = getAgentAddress().toLowerCase();
  const owners = (
    record.safe_owners?.length
      ? record.safe_owners
      : // Legacy record predating stored owner sets: the old 2-of-2 pair.
        [record.signer_address ?? "", getAgentAddress()]
  ).map((o) => o.toLowerCase());
  const signer = (await recoverSafeTxSigner(safeTxHash as Hex, userSignature as Hex)).toLowerCase();
  if (!owners.includes(signer) || signer === agent) {
    throw new Error("userSignature does not recover to a user owner of this Safe");
  }
  if (signer !== pendingTx.proposedBy?.toLowerCase()) {
    // Execution and attribution trust proposedBy as the signature's owner.
    throw new Error("proposedBy does not match the signature's signer");
  }

  // Co-signatures (relay-only execution): each must recover to a DISTINCT
  // non-agent owner and match its claimed signer.
  const seenSigners = new Set([signer]);
  for (const coSig of pendingTx.userSignatures ?? []) {
    const recovered = (
      await recoverSafeTxSigner(safeTxHash as Hex, coSig.data as Hex)
    ).toLowerCase();
    if (recovered !== coSig.signer.toLowerCase()) {
      throw new Error("co-signature does not recover to its claimed signer");
    }
    if (!owners.includes(recovered) || recovered === agent) {
      throw new Error("co-signature does not recover to a user owner of this Safe");
    }
    if (seenSigners.has(recovered)) {
      throw new Error("duplicate co-signature signer");
    }
    seenSigners.add(recovered);
  }

  // Screening can only be disabled when the user's own signatures meet the
  // threshold — otherwise "off" would mean the agent rubber-stamps
  // unscreened transactions. This arithmetic makes it impossible in guarded
  // wallets (1 user key vs threshold 2), automatic in starter (t=1), and a
  // deliberate two-signature act in protected.
  if (pendingTx.screeningDisabled && seenSigners.size < pendingTx.threshold) {
    throw new Error(
      "Screening cannot be disabled for this wallet — your keys alone don't meet the signing threshold. Co-sign with your backup key or use the Safe app."
    );
  }

  const rejectionTx: SafeTxData = {
    to: safeAddress,
    value: "0",
    data: "0x",
    operation: 0,
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: "0x0000000000000000000000000000000000000000",
    refundReceiver: "0x0000000000000000000000000000000000000000",
    nonce: safeNonce,
  };
  const rejectionHash = computeSafeTxHash(safeAddress, rejectionTx);
  const rejectionSigner = (
    await recoverSafeTxSigner(rejectionHash, rejectionSignature as Hex)
  ).toLowerCase();
  if (rejectionSigner !== signer) {
    throw new Error("rejectionSignature does not recover to the proposing owner");
  }
}

/**
 * Hard validation for the legacy 2-of-2 → 2-of-3 upgrade tx: the only thing
 * /queue will skip screening for is addOwnerWithThreshold(registered backup
 * key, 2) on the caller's own Safe.
 */
async function validateUpgradeTx(pendingTx: PendingTransaction & { calldata?: string }): Promise<void> {
  const { safeAddress, to, calldata } = pendingTx;
  if (!to || !calldata) throw new Error("Upgrade tx requires to and calldata");
  if (!isAddressEqual(to as Address, safeAddress as Address)) {
    throw new Error("Upgrade tx must target the Safe itself");
  }

  const decoded = decodeFunctionData({ abi: SAFE_ABI, data: calldata as Hex });
  if (decoded.functionName !== "addOwnerWithThreshold") {
    throw new Error("Upgrade tx must call addOwnerWithThreshold");
  }
  const [newOwner, threshold] = decoded.args as readonly [Address, bigint];
  if (threshold !== 2n) throw new Error("Upgrade tx must keep threshold 2");

  const record = await getUserDetails(safeAddress);
  if (!record?.external_wallet_address) {
    throw new Error("No backup key registered for this Safe — link a wallet first");
  }
  if (!isAddressEqual(newOwner, record.external_wallet_address as Address)) {
    throw new Error("Upgrade tx owner does not match the registered backup key");
  }
}

/** After an executed upgrade: persist the on-chain owner set (now 3 owners, threshold 2). */
async function finishUpgrade(safeAddress: string): Promise<void> {
  const owners = await readSafeOwners(safeAddress);
  await upsertUserDetails(safeAddress, {
    safe_owners: owners,
    safe_threshold: 2,
    safe_deployed: true,
  });
}

export function createQueueRouter(): IRouter {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    try {
      const pendingTx = req.body;

      if (!pendingTx?.id || !pendingTx?.to || !pendingTx?.amount) {
        res.status(400).json({
          error: "Missing required fields: id, to, amount",
        });
        return;
      }

      const isSafeTx = pendingTx.txType === "safetx";
      const isUpgrade = pendingTx.upgrade === true;

      if (isSafeTx) {
        try {
          await validateSafeTxProposal(pendingTx);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Invalid SafeTx proposal";
          res.status(400).json({ error: msg });
          return;
        }
      }

      if (isUpgrade) {
        try {
          await validateUpgradeTx(pendingTx);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Invalid upgrade transaction";
          res.status(400).json({ error: msg });
          return;
        }
      }

      try {
      await createTransaction(pendingTx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error("Failed to create transaction in DB:", msg);
        res.status(500).json({ error: "Failed to save transaction" });
        return;
      }

      // SafeTx flow: make sure the Safe exists on-chain (belt-and-braces for
      // the eager onboarding deploy), then mirror the proposal to the Safe
      // Transaction Service so it shows in app.safe.global. A service outage
      // must not block the queue — Zhentan's DB stays the source of truth.
      let serviceWarning: string | undefined;
      if (isSafeTx) {
        try {
          const record = await getUserDetails(pendingTx.safeAddress);
          if (!record?.safe_deployed && !(await isSafeDeployed(pendingTx.safeAddress))) {
            // Deploy with the account's OWN derivation recipe — owner set,
            // threshold and version from the record (legacy records without
            // stored owners are the old v1 2-of-2 pair).
            const owners =
              record?.safe_owners ??
              (record?.signer_address
                ? [record.signer_address, getAgentAddress()]
                : pendingTx.ownerAddresses);
            const threshold = record?.safe_threshold ?? pendingTx.threshold ?? 2;
            const version = (record?.derivation_version ??
              DERIVATION_V1_4337) as DerivationVersion;
            const result = await deploySafe(owners, threshold, version);
            if (result.address.toLowerCase() !== pendingTx.safeAddress.toLowerCase()) {
              throw new Error(
                `Owner set deploys to ${result.address}, not ${pendingTx.safeAddress}`
              );
            }
            await upsertUserDetails(pendingTx.safeAddress, {
              safe_deployed: true,
              ...(result.txHash && { safe_deploy_tx_hash: result.txHash }),
            });
          }
          await proposeToService({
            safeAddress: pendingTx.safeAddress,
            safeTx: pendingTx.safeTx,
            safeTxHash: pendingTx.safeTxHash,
            senderAddress: pendingTx.proposedBy,
            senderSignature: pendingTx.userSignature,
          });
        } catch (err) {
          serviceWarning = err instanceof Error ? err.message : String(err);
          console.error("Safe Transaction Service propose failed:", serviceWarning);
        }
      }

      // ── Upgrade tx: validated hard above, skips the risk engine ─────
      // Auto-execute through the legacy 4337 path (agent co-signs, gasless),
      // then persist the new on-chain owner set and flip to SafeTx mode.
      if (isUpgrade) {
        // Idempotency: if a previous attempt already added the owner on-chain
        // but the DB flip failed (or a retry races), addOwnerWithThreshold
        // would revert with "already an owner" — reconcile from chain instead.
        try {
          const record = await getUserDetails(pendingTx.safeAddress);
          const onChainOwners = (await readSafeOwners(pendingTx.safeAddress)).map((o) =>
            o.toLowerCase()
          );
          if (
            record?.external_wallet_address &&
            onChainOwners.includes(record.external_wallet_address.toLowerCase())
          ) {
            await finishUpgrade(pendingTx.safeAddress);
            res.json({ success: true, id: pendingTx.id, upgraded: true, alreadyUpgraded: true });
            return;
          }
        } catch {
          // Undeployed Safe (readSafeOwners reverts) or transient RPC — fall
          // through to the normal execute path.
        }

        const port = Number(process.env.PORT) || 3001;
        try {
          const agentSecret = process.env.AGENT_SECRET;
          const execRes = await fetch(`http://localhost:${port}/execute`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(agentSecret && { Authorization: `Bearer ${agentSecret}` }),
            },
            body: JSON.stringify({ txId: pendingTx.id }),
          });
          const execResult = (await execRes.json()) as Record<string, unknown>;
          if (execResult.status === "executed" || execResult.status === "already_executed") {
            // The on-chain upgrade succeeded; a failure persisting the owner
            // flip must not read as a failed upgrade (a retry would revert
            // on-chain) — the chain-reconcile block above self-heals it on
            // the next attempt.
            let upgradeWarning: string | undefined;
            try {
              await finishUpgrade(pendingTx.safeAddress);
            } catch (err) {
              upgradeWarning = err instanceof Error ? err.message : String(err);
              console.error("finishUpgrade failed (will self-heal on retry):", upgradeWarning);
            }
            res.json({
              success: true,
              id: pendingTx.id,
              autoExecuted: true,
              upgraded: true,
              txHash: execResult.txHash,
              ...(upgradeWarning && { upgradeWarning }),
            });
            return;
          }
          console.error("Upgrade execute returned:", execResult);
          res.status(500).json({
            error: `Upgrade execution failed: ${execResult.error || "unknown"}`,
            id: pendingTx.id,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error("Upgrade execute failed:", msg);
          res.status(500).json({ error: `Upgrade execution failed: ${msg}`, id: pendingTx.id });
        }
        return;
      }

      // When screening is disabled, only queue; client will call execute.
      if (pendingTx.screeningDisabled) {
        res.json({ success: true, id: pendingTx.id, ...(serviceWarning && { serviceWarning }) });
        return;
      }

      // ── Risk analysis ────────────────────────────────────────
      let risk;
      try {
        const patterns = await getPatternsForSafe(pendingTx.safeAddress ?? "");
        risk = analyzeRisk(pendingTx, patterns);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error("Risk analysis failed:", msg);
        res.json({ success: true, id: pendingTx.id, riskError: msg });
        return;
      }

      // Persist risk result onto the transaction
      await updateTransaction(pendingTx.id, {
        riskScore: risk.riskScore,
        riskVerdict: risk.verdict,
        riskReasons: risk.reasons,
      });

      const shortTo = `${pendingTx.to.slice(0, 6)}...${pendingTx.to.slice(-4)}`;
      const chatId = await getTelegramChatId(pendingTx.safeAddress ?? "");
      const txWithRisk = {
        ...pendingTx,
        riskScore: risk.riskScore,
        riskVerdict: risk.verdict,
        riskReasons: risk.reasons,
      };

      // ── APPROVE: auto-execute ────────────────────────────────
      if (risk.verdict === "APPROVE") {
        const port = Number(process.env.PORT) || 3001;

        try {
          const agentSecret = process.env.AGENT_SECRET;
          const execRes = await fetch(`http://localhost:${port}/execute`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(agentSecret && { Authorization: `Bearer ${agentSecret}` }),
            },
            body: JSON.stringify({ txId: pendingTx.id }),
          });
          const execResult = (await execRes.json()) as Record<string, unknown>;

          if (execResult.status === "executed") {
            // tx_sent notification (TG + email) is fired by execute.ts
            recordTxOutcome(txWithRisk, "auto_approved", {
              riskScore: risk.riskScore,
              riskVerdict: risk.verdict,
              riskReasons: risk.reasons,
              triggeredRules: risk.triggeredRules,
            }).catch((err) => console.error("Pattern record failed (auto_approved):", err));
            res.json({
              success: true,
              id: pendingTx.id,
              risk,
              autoExecuted: true,
              txHash: execResult.txHash,
              ...(serviceWarning && { serviceWarning }),
            });
            return;
          }

          // Execute call didn't succeed — fall through, respond without auto-execute
          console.error("Auto-execute returned:", execResult);
          notifyTelegram(
            `⚠️ Auto-approve attempted but execution failed for ${pendingTx.id}:\n` +
              `${pendingTx.amount} ${pendingTx.token || "USDC"} → ${shortTo}\n` +
              `Risk: ${risk.riskScore}/100 — ${risk.reasons.join(", ")}\n` +
              `Error: ${execResult.error || "unknown"}\n` +
              `Reply \`approve ${pendingTx.id}\` to retry.`,
            undefined,
            undefined,
            chatId
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error("Auto-execute fetch failed:", msg);
          notifyTelegram(
            `⚠️ Auto-approve attempted but execution failed for ${pendingTx.id}:\n` +
              `${pendingTx.amount} ${pendingTx.token || "USDC"} → ${shortTo}\n` +
              `Risk: ${risk.riskScore}/100 — ${risk.reasons.join(", ")}\n` +
              `Error: ${msg}\n` +
              `Reply \`approve ${pendingTx.id}\` to retry.`,
            undefined,
            undefined,
            chatId
          );
        }

        res.json({ success: true, id: pendingTx.id, risk, autoExecuted: false });
        return;
      }

      // ── REVIEW or BLOCK ──────────────────────────────────────
      await updateTransaction(pendingTx.id, {
        inReview: true,
        reviewedAt: new Date().toISOString(),
        reviewReason: risk.reasons.join("; "),
      });

      // Record behavioral event + update daily stats (fire-and-forget)
      const outcome = risk.verdict === "REVIEW" ? "sent_for_review" : "auto_blocked";
      Promise.all([
        recordTxOutcome(txWithRisk, outcome, {
          riskScore: risk.riskScore,
          riskVerdict: risk.verdict,
          riskReasons: risk.reasons,
          triggeredRules: risk.triggeredRules,
        }),
        incrementDailyStatsReview(pendingTx.safeAddress ?? ""),
      ]).catch((err) => console.error("Pattern record failed:", err));

      const reviewButtons = [
        [
          { text: `✅ approve ${pendingTx.id}` },
          { text: `❌ reject ${pendingTx.id}` },
        ],
        [
          { text: `🔎 deep-analyze ${pendingTx.id}` },
        ],
      ];

      // SafeTx proposals already sit in the Safe app queue at 1 of 2 — the
      // user can always go around the agent with their backup key there.
      const overrideLine = isSafeTx
        ? `\nOr sign with your backup key: https://app.safe.global/transactions/queue?safe=bnb:${pendingTx.safeAddress}`
        : "";

      const header = risk.verdict === "REVIEW" ? "🔍 REVIEW NEEDED" : "🚫 BLOCKED";
      notifyTelegram(
        `${header} — ${pendingTx.id}:\n` +
          `${pendingTx.amount} ${pendingTx.token || "USDC"} → ${shortTo}\n` +
          `Risk: ${risk.riskScore}/100\n` +
          `Reasons: ${risk.reasons.join(", ")}` +
          overrideLine,
        reviewButtons,
        pendingTx.id,
        chatId
      );

      // Email notification for REVIEW/BLOCK (TG is handled above with keyboard buttons)
      getUserDetails(pendingTx.safeAddress ?? "")
        .then((user) => {
          if (!user) return;
          const txPayload = {
            txId: pendingTx.id,
            amount: pendingTx.amount,
            token: pendingTx.token || "USDC",
            tokenLogoUrl: pendingTx.tokenIconUrl ?? undefined,
            amountUsd: pendingTx.amountUSD ? `$${pendingTx.amountUSD}` : undefined,
            toAddress: pendingTx.to,
            riskScore: risk.riskScore,
            reasons: risk.reasons,
          };
          if (risk.verdict === "REVIEW") {
            return notify("tx_review_needed", user, txPayload);
          }
          return notify("tx_blocked", user, txPayload);
        })
        .catch((err) => console.error("Email notify failed:", err));

      res.json({ success: true, id: pendingTx.id, risk, ...(serviceWarning && { serviceWarning }) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
