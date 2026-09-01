import type { ApiFetchFn } from "./client";
import { apiError } from "./client";

/**
 * #144 policy-change proposals. The client can only PROPOSE a limits change —
 * the agent applies it after the user confirms on Telegram. `PATCH /status`
 * limits writes are agent-only; this is the client's whole write surface.
 */

export interface LimitsProposalPatch {
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

export interface PolicyProposal {
  id: string;
  /** Row-shaped (snake_case) patch as stored server-side. */
  patch: Record<string, unknown>;
  proposedVia: "client" | "agent";
  status: "pending" | "confirmed" | "rejected" | "expired";
  expiresAt: string;
  createdAt: string;
  resolvedAt: string | null;
  rejectReason: string | null;
}

export function settingsApi(req: ApiFetchFn) {
  return {
    /** Create a proposal. 412 = no Telegram/agent link; 409 = one already pending. */
    async propose(safe: string, patch: LimitsProposalPatch): Promise<PolicyProposal> {
      const res = await req("/settings/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ safe, ...patch }),
      });
      if (!res.ok) throw await apiError(res, "Couldn’t propose the settings change");
      const data = (await res.json()) as { proposal: PolicyProposal };
      return data.proposal;
    },

    /** The caller's pending proposal, or null. */
    async pending(): Promise<PolicyProposal | null> {
      const res = await req("/settings/proposals");
      if (!res.ok) throw await apiError(res, "Couldn’t load pending settings changes");
      const data = (await res.json()) as { proposal: PolicyProposal | null };
      return data.proposal;
    },
  };
}
