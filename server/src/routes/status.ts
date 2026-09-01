import { Router, Request, Response, type IRouter } from "express";
import {
  getUserSettings,
  upsertUserSettings,
  getGlobalLimits,
  upsertGlobalLimits,
  DEFAULT_LIMITS,
  loadPolicySnapshot,
} from "../agent/index.js";
import type { GlobalLimitsRow } from "../lib/supabase/types.js";
import { assertOwnsSafe, requireAgentPrincipal } from "../lib/authz.js";
import {
  parseLimitsPatch,
  validateMergedLimits,
  LIMITS_API_FIELDS,
} from "../lib/screening/limits.js";

/** Row → API shape, shared by the PATCH response and the GET defaults contract. */
function limitsToJson(row: Omit<GlobalLimitsRow, "safe_address" | "updated_at">) {
  return {
    maxSingleTx: row.max_single_tx,
    maxHourlyVolume: row.max_hourly_volume,
    maxDailyVolume: row.max_daily_volume,
    maxWeeklyVolume: row.max_weekly_volume,
    maxDailyTxCount: row.max_daily_tx_count,
    allowedHoursUTC: row.allowed_hours_utc,
    allowedDaysUTC: row.allowed_days_utc,
    unknownRecipientAction: row.unknown_recipient_action,
    riskThresholdApprove: row.risk_threshold_approve,
    riskThresholdBlock: row.risk_threshold_block,
    learningEnabled: row.learning_enabled,
  };
}
import { ensureLinkMeta, getLinkBySafe } from "../lib/telegram/binding.js";
import { getUserDetails } from "../lib/supabase/index.js";
import { classifyProfile, type WalletState } from "../lib/safe/profiles.js";
import { getAgentAddress } from "../lib/safe/relayer.js";
import { runtimeLiveness } from "../lib/runtime/liveness.js";

/** Live wallet profile from the record's mirrored owner set (never stored). */
async function profileForSafe(
  safe: string
): Promise<{ profile: WalletState; structuralScreening: boolean }> {
  const record = await getUserDetails(safe).catch(() => null);
  if (!record) return { profile: "unknown", structuralScreening: false };
  const agent = getAgentAddress();
  const owners = record.safe_owners?.length
    ? record.safe_owners
    : [record.signer_address ?? "", agent];
  const profile = classifyProfile(owners, record.safe_threshold ?? 2, agent);
  // Guarded v2 ⇒ screening is structural. Legacy v1 guarded (pre-refactor
  // 2-of-2) keeps its historical choice: the agent co-signs even unscreened
  // (the legacy capability), so pausing is legitimate there.
  const structuralScreening = profile === "guarded" && (record.derivation_version ?? 1) >= 2;
  return { profile, structuralScreening };
}

export function createStatusRouter(): IRouter {
  const router = Router();

  // GET /status?safe=0x...
  // Returns user settings + full patterns (all dimensions)
  router.get("/", async (req: Request, res: Response) => {
    try {
      const safe = assertOwnsSafe(req, res, req.query.safe as string | undefined);
      if (!safe) return;

      const [settings, patterns, link, { profile, structuralScreening }] = await Promise.all([
        getUserSettings(safe),
        loadPolicySnapshot(safe),
        getLinkBySafe(safe).then((l) => (l ? ensureLinkMeta(l) : l)),
        profileForSafe(safe),
      ]);

      // EFFECTIVE screening mode (#136.1): guarded v2 ⇒ structurally ON —
      // the agent is the only possible co-signer, so a stored false is
      // drift, not a choice. Report the effective value and converge the
      // stored flag.
      const screeningLocked = structuralScreening;
      const screeningMode = screeningLocked ? true : settings.screening_mode;
      if (screeningLocked && !settings.screening_mode) {
        upsertUserSettings(safe, { screening_mode: true }).catch((err) =>
          console.error("screening_mode self-heal failed:", err)
        );
      }

      res.json({
        screeningMode,
        /** Guarded: screening is structural — the toggle is locked ON. */
        screeningLocked,
        profile,
        /** Runtime liveness — the truth behind any "agent online" surface. */
        agent: runtimeLiveness(),
        lastCheck: settings.last_check,
        totalDecisions: (settings.decisions ?? []).length,
        telegramLinked: Boolean(link),
        telegram: link
          ? {
              userId: link.telegram_user_id,
              username: link.telegram_username,
              name: link.telegram_name,
            }
          : null,
        /** Defaults contract (#144): the UI renders "default vs customized"
         *  from this instead of duplicating DEFAULT_LIMITS values. */
        defaultLimits: limitsToJson(DEFAULT_LIMITS),
        patterns,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // PATCH /status
  // Accepts: safe (optional; cross-checked against the caller), plus any combination of:
  //   User settings: screeningMode
  //   (Telegram identity is NOT writable here — the binding is owned by the
  //    #134 link flow: POST /telegram/link + /telegram/unlink.)
  //   Global limits: maxSingleTx, maxHourlyVolume, maxDailyVolume,
  //     maxWeeklyVolume, maxDailyTxCount, allowedHoursUTC, allowedDaysUTC,
  //     unknownRecipientAction, riskThresholdApprove, riskThresholdBlock,
  //     learningEnabled
  router.patch("/", async (req: Request, res: Response) => {
    try {
      const { safe: claimedSafe, screeningMode } = req.body ?? {};

      // Screening mode is the control this whole product rests on — turning it
      // off for someone else must be impossible, so the target Safe comes from
      // the caller and the body field is only ever a cross-check.
      const safe = assertOwnsSafe(req, res, claimedSafe);
      if (!safe) return;

      // ── Agent-only writes (#144) ─────────────────────────────
      // The policy plane must not be writable by the single-factor client
      // session. ONE carve-out: {screeningMode: true} alone — enabling
      // screening is strictly tightening (the same direction the guarded
      // self-heal already forces), and the settings page depends on it.
      const touchesLimits = LIMITS_API_FIELDS.some(
        (field) => (req.body ?? {})[field] !== undefined
      );
      const isEnableScreeningOnly = screeningMode === true && !touchesLimits;
      if (!isEnableScreeningOnly && !requireAgentPrincipal(req, res)) return;

      // ── Validate user settings ───────────────────────────────
      const settingsPatch: Parameters<typeof upsertUserSettings>[1] = {};
      let hasSettingsUpdate = false;

      if (screeningMode !== undefined) {
        if (typeof screeningMode !== "boolean") {
          res.status(400).json({ error: "screeningMode must be a boolean" });
          return;
        }
        // Guarded v2 ⇒ screening is structural (#136.1): the stored flag may
        // never be written false while the agent is the only possible
        // co-signer. (Unlink's SQL consequence still sets it — /status and
        // /queue report/enforce the effective value regardless.)
        if (screeningMode === false && (await profileForSafe(safe)).structuralScreening) {
          res.status(400).json({
            error:
              "Screening cannot be turned off for this wallet — your keys alone can never meet the signing threshold. Add a backup key to control screening.",
          });
          return;
        }
        settingsPatch.screening_mode = screeningMode;
        hasSettingsUpdate = true;
      }

      // ── Validate global limits: per-field shape, then cross-field on the
      // MERGED candidate state — updates are partial, so e.g. patching only
      // the block threshold must be checked against the stored approve. ──
      const parsed = parseLimitsPatch(req.body ?? {});
      if ("error" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const limitsPatch = parsed.patch;
      const hasLimitsUpdate = Object.keys(limitsPatch).length > 0;

      if (!hasSettingsUpdate && !hasLimitsUpdate) {
        res.status(400).json({ error: "No valid fields to update" });
        return;
      }

      let updatedLimits: GlobalLimitsRow;
      if (hasLimitsUpdate) {
        const current = await getGlobalLimits(safe);
        const mergedError = validateMergedLimits(current, limitsPatch);
        if (mergedError) {
          res.status(400).json({ error: mergedError });
          return;
        }
        updatedLimits = await upsertGlobalLimits(safe, limitsPatch);
      } else {
        updatedLimits = await getGlobalLimits(safe);
      }

      const updatedSettings = hasSettingsUpdate
        ? await upsertUserSettings(safe, settingsPatch)
        : await getUserSettings(safe);

      res.json({
        screeningMode: updatedSettings.screening_mode,
        limits: limitsToJson(updatedLimits),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
