import { Router, Request, Response, type IRouter } from "express";
import { type Hex } from "viem";
import {
  createTransaction,
  getUserDetails,
  upsertUserDetails,
} from "../lib/supabase/index.js";
import { upsertUserSettings } from "../agent/index.js";
import {
  validateTransitionTx,
  finishTransition,
  type TransitionTarget,
} from "../lib/safe/transition.js";
import { enqueueScreenJob, awaitScreeningOutcome } from "../lib/runtime/screening.js";
import {
  computeSafeTxHash,
  recoverSafeTxSigner,
  proposeToService,
} from "../lib/safe/service.js";
import { deploySafe, isSafeDeployed } from "../lib/safe/deploy.js";
import { DERIVATION_V1_4337, type DerivationVersion } from "../lib/safe/derive.js";
import { getAgentAddress } from "../lib/safe/relayer.js";
import { readSafeOwners } from "../lib/safe/onchain.js";
import { runExecutionById } from "../lib/execution/execute.js";
import type { PendingTransaction, SafeTxData } from "../types.js";

/**
 * Validates a client-submitted SafeTx proposal. The client's hash is never
 * trusted — we recompute it from the raw fields — and both signatures must
 * recover to a non-agent owner of this Safe (otherwise /queue would be a
 * signature oracle for arbitrary payloads).
 */
async function validateSafeTxProposal(
  pendingTx: PendingTransaction
): Promise<{ forcedScreening: boolean }> {
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

  // Screening-off proposals execute relay-only: the user's own signatures
  // must meet the threshold, because the agent never signs what it didn't
  // screen. Below-threshold proposals are still ACCEPTED when the user's
  // keys could complete them — a protected wallet whose backup key isn't
  // connected right now queues at 1/n (mirrored to the Safe Transaction
  // Service) and finishes later via in-app co-sign or the Safe app;
  // /execute refuses the row until the signatures arrive.
  //
  // Guarded wallets have one user key against the threshold, so the only
  // possible second signer is the agent — screening is STRUCTURAL for them
  // (#136.1). A guarded proposal claiming screening-off is not refused (that
  // soft-locked wallets whose stored flag drifted to false): it is FORCED
  // through screening, and the caller self-heals the stored flag.
  //
  // EXCEPTION — legacy v1 accounts WITHOUT a backup key: pre-refactor 2-of-2
  // Safes predate this model, and their users have relied on the agent as
  // co-signer since before it existed. Enforcing the rule would strand them
  // the instant they pause screening, so the agent stays their co-signer (it
  // still signs, it just skips risk analysis). The exemption is keyed on
  // CAPABILITY, not version alone: once a v1 account upgrades and its own
  // keys can meet the threshold, the strict v2 rule applies to it too.
  const derivationVersion = record.derivation_version ?? DERIVATION_V1_4337;
  const userOwnerCount = owners.filter((o) => o !== agent).length;
  const legacyExempt =
    derivationVersion === DERIVATION_V1_4337 &&
    userOwnerCount < pendingTx.threshold;
  let forcedScreening = false;
  if (
    pendingTx.screeningDisabled &&
    seenSigners.size < pendingTx.threshold &&
    !legacyExempt &&
    userOwnerCount < pendingTx.threshold
  ) {
    forcedScreening = true;
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
  return { forcedScreening };
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
      // "upgrade" is the pre-profiles wire name for what is now any profile transition.
      const isUpgrade = pendingTx.upgrade === true || pendingTx.transition === true;
      // The transition's simulated end state (owners+threshold), captured at
      // validation and reused to persist a deterministic post-execution profile.
      let transitionTarget: TransitionTarget | undefined;

      let forcedScreening = false;
      if (isSafeTx) {
        try {
          ({ forcedScreening } = await validateSafeTxProposal(pendingTx));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Invalid SafeTx proposal";
          res.status(400).json({ error: msg });
          return;
        }
      }
      if (forcedScreening) {
        // Guarded wallet with a drifted screening_mode=false (#136.1): the
        // agent is the only possible co-signer, so screening is structural.
        // Screen the proposal instead of refusing it, and converge the stored
        // flag so status/settings stop reporting the impossible state.
        pendingTx.screeningDisabled = false;
        upsertUserSettings(pendingTx.safeAddress, { screening_mode: true }).catch((err) =>
          console.error("screening_mode self-heal failed:", err)
        );
      }

      if (isUpgrade) {
        try {
          transitionTarget = await validateTransitionTx(pendingTx);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Invalid transition transaction";
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

      // ── Transition tx: hard-validated above ─────────────────────────
      // Two execution routes, chosen by WHO must sign (#136.3):
      //  - user signatures meet the current threshold (starter transitions,
      //    co-signed proposals) or the legacy v1 capability applies → direct
      //    synchronous execute, exactly as before (works without a runtime).
      //  - the agent must co-sign (threshold-2 target, v2) → THROUGH
      //    screening: the engine auto-approves the validated transition, the
      //    decision leaves the runtime record D4 signing requires, and
      //    auto-execute completes. The record-less direct execute would be
      //    refused by the runtime's signing authority.
      if (isUpgrade) {
        // Set above when isUpgrade validation passed; guard for the type system.
        if (!transitionTarget) {
          res.status(500).json({ error: "Transition target unresolved" });
          return;
        }
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
            await finishTransition(pendingTx.safeAddress, transitionTarget);
            res.json({ success: true, id: pendingTx.id, upgraded: true, alreadyUpgraded: true });
            return;
          }
        } catch {
          // Undeployed Safe (readSafeOwners reverts) or transient RPC — fall
          // through to the normal execute path.
        }

        const userSigCount = isSafeTx ? 1 + (pendingTx.userSignatures?.length ?? 0) : 0;
        const legacyCapable =
          (transitionTarget.derivationVersion ?? DERIVATION_V1_4337) === DERIVATION_V1_4337 &&
          transitionTarget.userOwnerCount < transitionTarget.currentThreshold;
        const needsAgentCosign =
          isSafeTx && userSigCount < transitionTarget.currentThreshold && !legacyCapable;

        if (needsAgentCosign) {
          const enqueued = await enqueueScreenJob(pendingTx);
          const outcome = enqueued ? await awaitScreeningOutcome(pendingTx.id) : null;
          if (outcome?.kind === "executed") {
            let upgradeWarning: string | undefined;
            try {
              await finishTransition(pendingTx.safeAddress, transitionTarget);
            } catch (err) {
              upgradeWarning = err instanceof Error ? err.message : String(err);
              console.error("finishTransition failed (will self-heal on retry):", upgradeWarning);
            }
            res.json({
              success: true,
              id: pendingTx.id,
              autoExecuted: true,
              upgraded: true,
              txHash: outcome.txHash,
              ...(serviceWarning && { serviceWarning }),
              ...(upgradeWarning && { upgradeWarning }),
            });
            return;
          }
          // Decision (and execution) lands asynchronously — apply.ts mirrors
          // the owner set for validated transitions when it auto-executes.
          // No runtime → fail-closed: the transition stays queued, upgraded:false.
          res.json({
            success: true,
            id: pendingTx.id,
            upgraded: false,
            screening: outcome ? outcome.kind : "pending",
            ...(serviceWarning && { serviceWarning }),
          });
          return;
        }

        try {
          const execResult = await runExecutionById(pendingTx.id);
          if (execResult.status === "executed" || execResult.status === "already_executed") {
            // The on-chain upgrade succeeded; a failure persisting the owner
            // flip must not read as a failed upgrade (a retry would revert
            // on-chain) — the chain-reconcile block above self-heals it on
            // the next attempt.
            let upgradeWarning: string | undefined;
            try {
              await finishTransition(pendingTx.safeAddress, transitionTarget);
            } catch (err) {
              upgradeWarning = err instanceof Error ? err.message : String(err);
              console.error("finishTransition failed (will self-heal on retry):", upgradeWarning);
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
            error: `Upgrade execution failed: ${execResult.status}`,
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

      // ── Screening (authoritative via the runtime, D3) ─────────
      // The backend no longer evaluates inline: the screen job carries the
      // assembled inputs to the runtime; the decision returns through the
      // Runtime API result endpoint, which applies it exactly once
      // (lib/screening/apply.ts — writes, notifications, auto-execute).
      // Here we only OBSERVE the transaction row with a bounded timeout so
      // a co-located runtime preserves the synchronous autoExecuted UX.
      // Fail-closed: no runtime → no decision → the proposal stays queued
      // and nothing executes. Relay-only/backup co-sign never reach here.
      const enqueued = await enqueueScreenJob(pendingTx);
      const outcome = enqueued ? await awaitScreeningOutcome(pendingTx.id) : null;

      if (!outcome || outcome.kind === "rejected") {
        // Timeout (or user rejection mid-screening): the decision will be
        // applied — with notifications — whenever the result lands.
        res.json({
          success: true,
          id: pendingTx.id,
          screening: "pending",
          ...(serviceWarning && { serviceWarning }),
        });
        return;
      }

      if (outcome.kind === "executed") {
        res.json({
          success: true,
          id: pendingTx.id,
          risk: outcome.risk,
          autoExecuted: true,
          txHash: outcome.txHash,
          ...(serviceWarning && { serviceWarning }),
        });
        return;
      }
      if (outcome.kind === "approve_pending") {
        res.json({ success: true, id: pendingTx.id, risk: outcome.risk, autoExecuted: false });
        return;
      }
      res.json({
        success: true,
        id: pendingTx.id,
        risk: outcome.risk,
        ...(serviceWarning && { serviceWarning }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
