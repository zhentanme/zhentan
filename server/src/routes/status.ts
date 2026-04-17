import { Router, Request, Response, type IRouter } from "express";
import {
  getUserSettings,
  upsertUserSettings,
  getGlobalLimits,
  upsertGlobalLimits,
  getPatternsForSafe,
} from "../lib/supabase/index.js";
import type { GlobalLimitsRow } from "../lib/supabase/types.js";

export function createStatusRouter(): IRouter {
  const router = Router();

  // GET /status?safe=0x...
  // Returns user settings + full patterns (all dimensions)
  router.get("/", async (req: Request, res: Response) => {
    try {
      const safe = req.query.safe as string | undefined;
      if (!safe) {
        res.status(400).json({ error: "Missing required query param: safe" });
        return;
      }

      const [settings, patterns] = await Promise.all([
        getUserSettings(safe),
        getPatternsForSafe(safe),
      ]);

      res.json({
        screeningMode: settings.screening_mode,
        lastCheck: settings.last_check,
        totalDecisions: (settings.decisions ?? []).length,
        telegramChatId: settings.telegram_chat_id,
        botConnected: settings.bot_connected ?? false,
        patterns,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // PATCH /status
  // Accepts: safe (required), plus any combination of:
  //   User settings: screeningMode, telegramChatId, botConnected
  //   Global limits: maxSingleTx, maxHourlyVolume, maxDailyVolume,
  //     maxWeeklyVolume, maxDailyTxCount, allowedHoursUTC, allowedDaysUTC,
  //     unknownRecipientAction, riskThresholdApprove, riskThresholdBlock,
  //     learningEnabled
  router.patch("/", async (req: Request, res: Response) => {
    try {
      const {
        safe,
        // User settings fields
        screeningMode,
        telegramChatId,
        botConnected,
        // Global limits fields
        maxSingleTx,
        maxHourlyVolume,
        maxDailyVolume,
        maxWeeklyVolume,
        maxDailyTxCount,
        allowedHoursUTC,
        allowedDaysUTC,
        unknownRecipientAction,
        riskThresholdApprove,
        riskThresholdBlock,
        learningEnabled,
      } = req.body;

      if (!safe) {
        res.status(400).json({ error: "Missing required field: safe" });
        return;
      }

      // ── Validate and persist user settings ──────────────────
      const settingsPatch: Parameters<typeof upsertUserSettings>[1] = {};
      let hasSettingsUpdate = false;

      if (screeningMode !== undefined) {
        if (typeof screeningMode !== "boolean") {
          res.status(400).json({ error: "screeningMode must be a boolean" });
          return;
        }
        settingsPatch.screening_mode = screeningMode;
        hasSettingsUpdate = true;
      }
      if (telegramChatId !== undefined) {
        if (typeof telegramChatId !== "string") {
          res.status(400).json({ error: "telegramChatId must be a string" });
          return;
        }
        settingsPatch.telegram_chat_id = telegramChatId || null;
        hasSettingsUpdate = true;
      }
      if (botConnected !== undefined) {
        if (typeof botConnected !== "boolean") {
          res.status(400).json({ error: "botConnected must be a boolean" });
          return;
        }
        settingsPatch.bot_connected = botConnected;
        hasSettingsUpdate = true;
      }

      // ── Validate and persist global limits ───────────────────
      const limitsPatch: Partial<Omit<GlobalLimitsRow, "safe_address" | "updated_at">> = {};
      let hasLimitsUpdate = false;

      if (maxSingleTx !== undefined)        { limitsPatch.max_single_tx        = String(maxSingleTx); hasLimitsUpdate = true; }
      if (maxHourlyVolume !== undefined)     { limitsPatch.max_hourly_volume    = String(maxHourlyVolume); hasLimitsUpdate = true; }
      if (maxDailyVolume !== undefined)      { limitsPatch.max_daily_volume     = String(maxDailyVolume); hasLimitsUpdate = true; }
      if (maxWeeklyVolume !== undefined)     { limitsPatch.max_weekly_volume    = String(maxWeeklyVolume); hasLimitsUpdate = true; }
      if (maxDailyTxCount !== undefined)     { limitsPatch.max_daily_tx_count   = Number(maxDailyTxCount); hasLimitsUpdate = true; }
      if (allowedHoursUTC !== undefined)     { limitsPatch.allowed_hours_utc    = allowedHoursUTC; hasLimitsUpdate = true; }
      if (allowedDaysUTC !== undefined)      { limitsPatch.allowed_days_utc     = allowedDaysUTC; hasLimitsUpdate = true; }
      if (learningEnabled !== undefined)     { limitsPatch.learning_enabled     = Boolean(learningEnabled); hasLimitsUpdate = true; }

      if (unknownRecipientAction !== undefined) {
        if (!["approve", "review", "block"].includes(unknownRecipientAction)) {
          res.status(400).json({ error: "unknownRecipientAction must be 'approve', 'review', or 'block'" });
          return;
        }
        limitsPatch.unknown_recipient_action = unknownRecipientAction;
        hasLimitsUpdate = true;
      }
      if (riskThresholdApprove !== undefined) {
        const val = Number(riskThresholdApprove);
        if (isNaN(val) || val < 0 || val > 100) {
          res.status(400).json({ error: "riskThresholdApprove must be 0–100" });
          return;
        }
        limitsPatch.risk_threshold_approve = val;
        hasLimitsUpdate = true;
      }
      if (riskThresholdBlock !== undefined) {
        const val = Number(riskThresholdBlock);
        if (isNaN(val) || val < 0 || val > 100) {
          res.status(400).json({ error: "riskThresholdBlock must be 0–100" });
          return;
        }
        limitsPatch.risk_threshold_block = val;
        hasLimitsUpdate = true;
      }

      if (!hasSettingsUpdate && !hasLimitsUpdate) {
        res.status(400).json({ error: "No valid fields to update" });
        return;
      }

      // Run updates in parallel
      const [updatedSettings, updatedLimits] = await Promise.all([
        hasSettingsUpdate ? upsertUserSettings(safe, settingsPatch) : getUserSettings(safe),
        hasLimitsUpdate ? upsertGlobalLimits(safe, limitsPatch) : getGlobalLimits(safe),
      ]);

      res.json({
        screeningMode: updatedSettings.screening_mode,
        telegramChatId: updatedSettings.telegram_chat_id,
        botConnected: updatedSettings.bot_connected ?? false,
        limits: {
          maxSingleTx:             updatedLimits.max_single_tx,
          maxHourlyVolume:         updatedLimits.max_hourly_volume,
          maxDailyVolume:          updatedLimits.max_daily_volume,
          maxWeeklyVolume:         updatedLimits.max_weekly_volume,
          maxDailyTxCount:         updatedLimits.max_daily_tx_count,
          allowedHoursUTC:         updatedLimits.allowed_hours_utc,
          allowedDaysUTC:          updatedLimits.allowed_days_utc,
          unknownRecipientAction:  updatedLimits.unknown_recipient_action,
          riskThresholdApprove:    updatedLimits.risk_threshold_approve,
          riskThresholdBlock:      updatedLimits.risk_threshold_block,
          learningEnabled:         updatedLimits.learning_enabled,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}

export async function getTelegramChatIdForSafe(
  safeAddress: string
): Promise<string | undefined> {
  const settings = await getUserSettings(safeAddress);
  return settings.telegram_chat_id ?? undefined;
}
