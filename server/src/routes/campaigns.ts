import { Router, type Request, type Response, type IRouter } from "express";
import {
  getCampaign,
  getCampaigns,
  getCampaignClaimCount,
  getCampaignClaim,
  createCampaignClaim,
  getUserDetails,
} from "../lib/supabase/index.js";
import type { UserDetailsRow } from "../lib/supabase/types.js";
import { payCampaignClaim } from "../lib/campaignPayout.js";

type RequirementKey = "tg_connected" | "username_claimed";

function checkRequirements(
  requirements: Record<string, unknown>,
  user: UserDetailsRow
): { met: boolean; missing: string[] } {
  const missing: string[] = [];

  const checks: Record<RequirementKey, () => boolean> = {
    tg_connected:     () => !!user.telegram_id,
    username_claimed: () => !!user.username,
  };

  for (const [key, required] of Object.entries(requirements)) {
    if (!required) continue;
    const check = checks[key as RequirementKey];
    if (!check || !check()) missing.push(key);
  }

  return { met: missing.length === 0, missing };
}

export function createCampaignsRouter(): IRouter {
  const router = Router();

  // GET /campaigns — list all active campaigns
  router.get("/", async (_req: Request, res: Response) => {
    try {
      const campaigns = await getCampaigns();
      res.json({ campaigns });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /campaigns/:id — get campaign + claim status for the caller
  router.get("/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    const safeAddress = req.user?.safe_address ?? req.query.safe as string | undefined;
    if (!safeAddress) {
      res.status(400).json({ error: "Missing required query param: safe" });
      return;
    }
    try {
      const [campaign, claimCount, existingClaim] = await Promise.all([
        getCampaign(id),
        getCampaignClaimCount(id),
        getCampaignClaim(id, safeAddress),
      ]);
      if (!campaign) {
        res.status(404).json({ error: "Campaign not found" });
        return;
      }
      res.json({
        campaign,
        claimsRemaining: campaign.max_claims - claimCount,
        userClaim: existingClaim,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /campaigns/:id/claim — claim tokens and trigger treasury payout
  router.post("/:id/claim", async (req: Request, res: Response) => {
    const { id } = req.params;
    const safeAddress = req.user?.safe_address ?? req.body?.safeAddress;
    if (!safeAddress) {
      res.status(400).json({ error: "Missing required field: safeAddress" });
      return;
    }

    try {
      const [campaign, claimCount, existingClaim, userDetails] = await Promise.all([
        getCampaign(id),
        getCampaignClaimCount(id),
        getCampaignClaim(id, safeAddress),
        getUserDetails(safeAddress),
      ]);

      if (!campaign) {
        res.status(404).json({ error: "Campaign not found" });
        return;
      }

      const now = new Date();
      if (now < new Date(campaign.starts_at)) {
        res.status(400).json({ error: "Campaign has not started yet" });
        return;
      }
      if (campaign.ends_at && now > new Date(campaign.ends_at)) {
        res.status(400).json({ error: "Campaign has ended" });
        return;
      }
      if (claimCount >= campaign.max_claims) {
        res.status(400).json({ error: "Campaign is fully claimed" });
        return;
      }
      if (existingClaim) {
        res.status(400).json({ error: "Already claimed", claim: existingClaim });
        return;
      }
      if (!userDetails) {
        res.status(400).json({ error: "User not found — complete onboarding first" });
        return;
      }

      const { met, missing } = checkRequirements(
        campaign.requirements as Record<string, unknown>,
        userDetails
      );
      if (!met) {
        res.status(400).json({
          error: "Requirements not met",
          missing: missing.map((key) => ({
            tg_connected:     "Connect your Telegram account",
            username_claimed: "Set a username",
          }[key] ?? key)),
        });
        return;
      }

      const claim = await createCampaignClaim(id, safeAddress, campaign.token_amount);

      // Fire-and-forget payout — claim is already recorded; payout failure doesn't
      // block the response and can be retried via /payout/send.
      payCampaignClaim(id, safeAddress, claim.token_amount).catch((err) =>
        console.error(`Campaign ${id} payout failed for ${safeAddress}:`, err)
      );

      res.json({ claim });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
