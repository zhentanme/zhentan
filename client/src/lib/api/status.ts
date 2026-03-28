import type { ApiFetchFn } from "./client";
import type { StatusResponse } from "@/types";

export interface StatusPatch {
  safe: string;
  screeningMode?: boolean;
  telegramChatId?: string;
  maxSingleTx?: string;
  maxHourlyVolume?: string;
  maxDailyVolume?: string;
  maxWeeklyVolume?: string;
  maxDailyTxCount?: number;
  allowedHoursUTC?: number[];
  allowedDaysUTC?: number[];
  unknownRecipientAction?: "approve" | "review" | "block";
  riskThresholdApprove?: number;
  riskThresholdBlock?: number;
  learningEnabled?: boolean;
}

export function statusApi(req: ApiFetchFn) {
  return {
    async get(safeAddress: string): Promise<StatusResponse> {
      const res = await req(`/status?safe=${encodeURIComponent(safeAddress)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    async update(patch: StatusPatch): Promise<Record<string, unknown>> {
      const res = await req("/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  };
}
