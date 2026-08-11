/**
 * Screening-decision application (D3) — the single place a screening
 * verdict becomes canonical state. Called from the Runtime API result
 * endpoint when an authoritative screen job lands (fast path: milliseconds
 * after proposal; late path: whenever a delayed runtime answers). The
 * propose handler never applies decisions itself — it observes the
 * transaction row (awaitScreeningOutcome in lib/runtime/screening.ts).
 *
 * Exactly-once: application is guarded by the transaction's own state — a
 * row that already carries a risk verdict (or is executed/rejected/moved
 * on) is never re-applied. Notifications remain backend-owned here,
 * permanently: the runtime reports decisions; this module maps them to
 * Telegram/email.
 */
import {
  getTransaction,
  updateTransaction,
  getTelegramChatId,
  getUserDetails,
} from "../supabase/index.js";
import { recordOutcome, noteReviewOutcome, type RiskResult } from "../../agent/index.js";
import { runExecutionById } from "../execution/execute.js";
import { notifyTelegram } from "../../notify.js";
import { notify } from "../../notifications/index.js";
import { classifyProfile } from "../safe/profiles.js";
import { getAgentAddress } from "../safe/relayer.js";
import { isRejectionActive } from "../safe/rejectionState.js";

export type ApplyOutcome =
  | { status: "applied_executed"; txHash?: string }
  | { status: "applied_execute_failed" }
  | { status: "applied_review" }
  | { status: "applied_blocked" }
  | { status: "already_applied" }
  | { status: "not_applicable"; reason: string };

export async function applyScreeningDecision(
  txId: string,
  risk: RiskResult
): Promise<ApplyOutcome> {
  const tx = await getTransaction(txId);
  if (!tx) return { status: "not_applicable", reason: "transaction not found" };
  if (tx.riskVerdict) return { status: "already_applied" };
  if (tx.executedAt) return { status: "not_applicable", reason: "already executed" };
  if (tx.rejected || isRejectionActive(tx.rejectionStatus)) {
    return { status: "not_applicable", reason: "rejection in progress" };
  }
  if (tx.screeningDisabled) {
    return { status: "not_applicable", reason: "screening disabled" };
  }

  // The FULL screening outcome in one write: risk fields plus, for
  // REVIEW/BLOCK, the review flag — one version bump (see D2 history).
  await updateTransaction(txId, {
    riskScore: risk.riskScore,
    riskVerdict: risk.verdict,
    riskReasons: risk.reasons,
    ...(risk.verdict !== "APPROVE" && {
      inReview: true,
      reviewedAt: new Date().toISOString(),
      reviewReason: risk.reasons.join("; "),
    }),
  });

  const shortTo = `${tx.to.slice(0, 6)}...${tx.to.slice(-4)}`;
  const chatId = await getTelegramChatId(tx.safeAddress ?? "");
  const txWithRisk = {
    ...tx,
    riskScore: risk.riskScore,
    riskVerdict: risk.verdict,
    riskReasons: risk.reasons,
  };

  // ── APPROVE: auto-execute ────────────────────────────────
  if (risk.verdict === "APPROVE") {
    try {
      // In-process, deliberately: system-initiated work with no user
      // principal behind it — it must not travel back through the
      // authenticated HTTP surface (see lib/authz.ts).
      const execResult = await runExecutionById(txId);
      if (execResult.status === "executed") {
        // tx_sent notification (TG + email) is fired by execute.ts
        recordOutcome(txWithRisk, "auto_approved", {
          riskScore: risk.riskScore,
          riskVerdict: risk.verdict,
          riskReasons: risk.reasons,
          triggeredRules: risk.triggeredRules,
        }).catch((err) => console.error("Pattern record failed (auto_approved):", err));
        return { status: "applied_executed", txHash: execResult.txHash };
      }
      console.error("Auto-execute returned:", execResult);
      const detail =
        execResult.status === "superseded" && "reason" in execResult && execResult.reason
          ? `${execResult.status} (${execResult.reason})`
          : execResult.status;
      notifyExecuteFailure(tx, risk, shortTo, chatId, detail);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Auto-execute failed:", msg);
      notifyExecuteFailure(tx, risk, shortTo, chatId, msg);
    }
    return { status: "applied_execute_failed" };
  }

  // ── REVIEW or BLOCK ──────────────────────────────────────
  const outcome = risk.verdict === "REVIEW" ? "sent_for_review" : "auto_blocked";
  Promise.all([
    recordOutcome(txWithRisk, outcome, {
      riskScore: risk.riskScore,
      riskVerdict: risk.verdict,
      riskReasons: risk.reasons,
      triggeredRules: risk.triggeredRules,
    }),
    noteReviewOutcome(tx.safeAddress ?? ""),
  ]).catch((err) => console.error("Pattern record failed:", err));

  const reviewButtons = [
    [{ text: `✅ approve ${txId}` }, { text: `❌ reject ${txId}` }],
    [{ text: `🔎 deep-analyze ${txId}` }],
  ];

  // SafeTx proposals already sit in the Safe app queue at 1 of 2 — a
  // PROTECTED wallet's user can go around the agent with their backup key
  // there (guarded wallets have no second user key to sign with).
  let overrideLine = "";
  if (tx.txType === "safetx") {
    const ownerRecord = await getUserDetails(tx.safeAddress).catch(() => null);
    const liveOwners = ownerRecord?.safe_owners?.length
      ? ownerRecord.safe_owners
      : [ownerRecord?.signer_address ?? "", getAgentAddress()];
    const profile = classifyProfile(liveOwners, ownerRecord?.safe_threshold ?? 2, getAgentAddress());
    if (profile === "protected") {
      overrideLine = `\nOr sign with your backup key: https://app.safe.global/transactions/queue?safe=bnb:${tx.safeAddress}`;
    }
  }

  const header = risk.verdict === "REVIEW" ? "🔍 REVIEW NEEDED" : "🚫 BLOCKED";
  notifyTelegram(
    `${header} — ${txId}:\n` +
      `${tx.amount} ${tx.token || "USDC"} → ${shortTo}\n` +
      `Risk: ${risk.riskScore}/100\n` +
      `Reasons: ${risk.reasons.join(", ")}` +
      overrideLine,
    reviewButtons,
    txId,
    chatId
  );

  getUserDetails(tx.safeAddress ?? "")
    .then((user) => {
      if (!user) return;
      const txPayload = {
        txId,
        amount: tx.amount,
        token: tx.token || "USDC",
        tokenLogoUrl: tx.tokenIconUrl ?? undefined,
        amountUsd: tx.amountUSD ? `$${tx.amountUSD}` : undefined,
        toAddress: tx.to,
        riskScore: risk.riskScore,
        reasons: risk.reasons,
      };
      return notify(risk.verdict === "REVIEW" ? "tx_review_needed" : "tx_blocked", user, txPayload);
    })
    .catch((err) => console.error("Email notify failed:", err));

  return risk.verdict === "REVIEW" ? { status: "applied_review" } : { status: "applied_blocked" };
}

function notifyExecuteFailure(
  tx: { id: string; amount: string; token?: string },
  risk: RiskResult,
  shortTo: string,
  chatId: string | undefined,
  detail: string
): void {
  notifyTelegram(
    `⚠️ Auto-approve attempted but execution failed for ${tx.id}:\n` +
      `${tx.amount} ${tx.token || "USDC"} → ${shortTo}\n` +
      `Risk: ${risk.riskScore}/100 — ${risk.reasons.join(", ")}\n` +
      `Error: ${detail}\n` +
      `Reply \`approve ${tx.id}\` to retry.`,
    undefined,
    undefined,
    chatId
  );
}
