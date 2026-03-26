import { Router, Request, Response, type IRouter } from "express";
import { analyzeRisk } from "../risk.js";
import { notifyTelegram } from "../notify.js";
import {
  createTransaction,
  updateTransaction,
  getPatternsForSafe,
  getTelegramChatId,
  recordTxOutcome,
  incrementDailyStatsReview,
} from "../lib/supabase/index.js";

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

      await createTransaction(pendingTx);

      // When screening is disabled, only queue; client will call execute.
      if (pendingTx.screeningDisabled) {
        res.json({ success: true, id: pendingTx.id });
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
          const execRes = await fetch(`http://localhost:${port}/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ txId: pendingTx.id }),
          });
          const execResult = (await execRes.json()) as Record<string, unknown>;

          if (execResult.status === "executed") {
            notifyTelegram(
              `✅ Auto-approved and executed ${pendingTx.id}:\n` +
                `${pendingTx.amount} ${pendingTx.token || "USDC"} → ${shortTo}\n` +
                `Risk: ${risk.riskScore}/100 — ${risk.reasons.join(", ")}\n` +
                `Explore: https://bscscan.com/tx/${execResult.txHash}`,
              undefined,
              undefined,
              chatId
            );
            res.json({
              success: true,
              id: pendingTx.id,
              risk,
              autoExecuted: true,
              txHash: execResult.txHash,
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
          { text: "✅ Approve", callback_data: `approve ${pendingTx.id}` },
          { text: "❌ Reject",  callback_data: `reject ${pendingTx.id}` },
        ],
        [
          { text: "🔎 Deep Analyze", callback_data: `deep-analyze ${pendingTx.id}` },
        ],
      ];

      if (risk.verdict === "REVIEW") {
        notifyTelegram(
          `🔍 REVIEW NEEDED — ${pendingTx.id}:\n` +
            `${pendingTx.amount} ${pendingTx.token || "USDC"} → ${shortTo}\n` +
            `Risk: ${risk.riskScore}/100\n` +
            `Reasons: ${risk.reasons.join(", ")}`,
          reviewButtons,
          pendingTx.id,
          chatId
        );
      } else {
        notifyTelegram(
          `🚫 BLOCKED — ${pendingTx.id}:\n` +
            `${pendingTx.amount} ${pendingTx.token || "USDC"} → ${shortTo}\n` +
            `Risk: ${risk.riskScore}/100\n` +
            `Reasons: ${risk.reasons.join(", ")}`,
          reviewButtons,
          pendingTx.id,
          chatId
        );
      }

      res.json({ success: true, id: pendingTx.id, risk });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
