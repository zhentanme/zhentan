import { Router, Request, Response, type IRouter } from "express";
import { getGlobalLimits, upsertGlobalLimits, recordPolicyChange } from "../agent/index.js";
import { assertOwnsSafe, requireAgentPrincipal, requireCallerSafe } from "../lib/authz.js";
import {
  parseLimitsPatch,
  validateMergedLimits,
  describeLimitsChanges,
} from "../lib/screening/limits.js";
import {
  createProposal,
  claimProposal,
  expireStaleProposals,
  getPendingProposal,
  markClaimedProposalRejected,
  type PolicyChangeProposalRow,
} from "../lib/supabase/proposals.js";
import { getTelegramChatId } from "../lib/supabase/index.js";
import { notifyTelegram } from "../notify.js";

/**
 * #144 Phase 1 — the policy-change proposal lifecycle.
 *
 * The client may only PROPOSE a limits change; the AGENT applies it after
 * the user confirms on Telegram — the independent channel the
 * compromised-web-session threat model requires. No agent/Telegram link ⇒
 * no proposal (412): nothing ever auto-applies on a timer or an email.
 */

const PROPOSAL_TTL_MS = 15 * 60 * 1000; // matches the link-code pattern (#134)

function proposalToJson(row: PolicyChangeProposalRow) {
  return {
    id: row.id,
    patch: row.patch,
    proposedVia: row.proposed_via,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    rejectReason: row.reject_reason,
  };
}

export function createSettingsRouter(): IRouter {
  const router = Router();

  // POST /settings/proposals
  // Body: { safe?, ...limits fields }. Any authenticated principal may
  // propose (the client's only path to a limits change); nothing is applied
  // here. 412 without a Telegram link, 409 while another proposal is pending.
  router.post("/proposals", async (req: Request, res: Response) => {
    try {
      const safe = assertOwnsSafe(req, res, req.body?.safe);
      if (!safe) return;

      const parsed = parseLimitsPatch(req.body ?? {});
      if ("error" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      if (Object.keys(parsed.patch).length === 0) {
        res.status(400).json({ error: "No limits fields to propose" });
        return;
      }

      // Positive confirmation needs the agent channel — no link, no proposal.
      const chatId = await getTelegramChatId(safe);
      if (!chatId) {
        res.status(412).json({
          error:
            "Connect your Zhentan agent on Telegram first — settings changes are confirmed there.",
        });
        return;
      }

      const current = await getGlobalLimits(safe);
      const mergedError = validateMergedLimits(current, parsed.patch);
      if (mergedError) {
        res.status(400).json({ error: mergedError });
        return;
      }

      const changes = describeLimitsChanges(current, parsed.patch);
      if (changes.length === 0) {
        res.status(400).json({ error: "Proposed values match the current settings" });
        return;
      }

      await expireStaleProposals(safe);
      const proposal = await createProposal(
        safe,
        parsed.patch,
        req.principalKind === "agent" ? "agent" : "client",
        PROPOSAL_TTL_MS
      );
      if (!proposal) {
        res.status(409).json({
          error: "A settings change is already awaiting confirmation — resolve it first.",
        });
        return;
      }

      notifyTelegram(
        [
          "⚙️ *Settings change requested from the app*",
          "",
          ...changes.map((line) => `• ${line}`),
          "",
          "Reply *confirm settings change* or *reject settings change*. " +
            "Expires in 15 minutes. If you didn't request this, reject it and " +
            "review your account.",
        ].join("\n"),
        [[{ text: "✅ Confirm settings change" }, { text: "❌ Reject settings change" }]],
        undefined,
        chatId
      );

      res.status(201).json({ proposal: proposalToJson(proposal) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // GET /settings/proposals
  // The caller's pending proposal (after the lazy expiry sweep), or null.
  router.get("/proposals", async (req: Request, res: Response) => {
    try {
      const safe = requireCallerSafe(req, res);
      if (!safe) return;
      await expireStaleProposals(safe);
      const pending = await getPendingProposal(safe);
      res.json({ proposal: pending ? proposalToJson(pending) : null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // POST /settings/proposals/:id/confirm — AGENT-only. Atomically claims the
  // pending proposal (concurrent confirm/reject can't both act), re-validates
  // against the LIVE row, applies, and audits.
  router.post("/proposals/:id/confirm", async (req: Request, res: Response) => {
    try {
      if (!requireAgentPrincipal(req, res)) return;
      const safe = requireCallerSafe(req, res);
      if (!safe) return;

      await expireStaleProposals(safe);
      const claimed = await claimProposal(req.params.id, safe, "confirmed", {
        confirmedVia: "telegram",
      });
      if (!claimed) {
        res.status(409).json({
          error: "Proposal is not pending — it was already resolved or has expired.",
        });
        return;
      }

      // The stored row may have changed between creation and apply.
      const current = await getGlobalLimits(safe);
      const mergedError = validateMergedLimits(current, claimed.patch);
      if (mergedError) {
        await markClaimedProposalRejected(claimed.id, mergedError);
        res.status(409).json({
          error: `Settings changed since this was proposed — rejected: ${mergedError}`,
        });
        return;
      }

      const changes = describeLimitsChanges(current, claimed.patch);
      const updated = await upsertGlobalLimits(safe, claimed.patch);

      recordPolicyChange(safe, {
        event: "policy_change_applied",
        proposalId: claimed.id,
        proposedVia: claimed.proposed_via,
        confirmedVia: "telegram",
        changes,
        patch: claimed.patch,
      }).catch((err) => console.error("policy_change audit failed:", err));

      res.json({ ok: true, applied: changes, limits: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // POST /settings/proposals/:id/reject — AGENT-only.
  router.post("/proposals/:id/reject", async (req: Request, res: Response) => {
    try {
      if (!requireAgentPrincipal(req, res)) return;
      const safe = requireCallerSafe(req, res);
      if (!safe) return;

      const reason =
        typeof req.body?.reason === "string" ? req.body.reason.slice(0, 300) : "rejected by user";
      const claimed = await claimProposal(req.params.id, safe, "rejected", {
        rejectReason: reason,
      });
      if (!claimed) {
        res.status(409).json({
          error: "Proposal is not pending — it was already resolved or has expired.",
        });
        return;
      }

      recordPolicyChange(safe, {
        event: "policy_change_rejected",
        proposalId: claimed.id,
        proposedVia: claimed.proposed_via,
        reason,
        patch: claimed.patch,
      }).catch((err) => console.error("policy_change audit failed:", err));

      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
