import type { ApiFetchFn } from "./client";
import { apiError } from "./client";

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  token_amount: string;
  max_claims: number;
  requirements: Record<string, boolean>;
  starts_at: string;
  ends_at: string | null;
}

export interface CampaignClaim {
  campaign_id: string;
  safe_address: string;
  claimed_at: string;
  token_amount: string;
  status: "pending" | "paid" | "failed";
  tx_hash: string | null;
}

export interface CampaignStatus {
  campaign: Campaign;
  claimsRemaining: number;
  userClaim: CampaignClaim | null;
}

export function campaignsApi(req: ApiFetchFn) {
  return {
    async get(id: string, safeAddress: string): Promise<CampaignStatus> {
      const res = await req(`/campaigns/${id}?safe=${safeAddress}`);
      if (!res.ok) throw await apiError(res, "Couldn’t load the claim status");
      return res.json();
    },

    async claim(id: string, safeAddress: string): Promise<CampaignClaim> {
      const res = await req(`/campaigns/${id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ safeAddress }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn’t claim rewards");
      }
      const data = await res.json();
      return data.claim;
    },
  };
}
