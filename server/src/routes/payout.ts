import { Router, type Request, type Response, type IRouter } from "express";
import type { Address } from "viem";
import {
  getCampaign,
  getCampaignClaim,
  updateCampaignClaim,
} from "../lib/supabase/index.js";
import { getTreasurySafeAddress, sendTokenFromTreasury } from "../lib/treasury.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves the token address and decimals to use for a payout.
 * Falls back to TREASURY_TOKEN_ADDRESS / TREASURY_TOKEN_DECIMALS env vars.
 */
function resolveToken(
  tokenAddress?: string,
  decimals?: number
): { tokenAddress: Address; decimals: number } {
  const addr = tokenAddress ?? process.env.TREASURY_TOKEN_ADDRESS;
  if (!addr) {
    throw new Error(
      "Token address required: pass tokenAddress in the request body or set TREASURY_TOKEN_ADDRESS"
    );
  }
  return {
    tokenAddress: addr as Address,
    decimals: decimals ?? Number(process.env.TREASURY_TOKEN_DECIMALS ?? "18"),
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function createPayoutRouter(): IRouter {
  const router = Router();

  /**
   * GET /payout/treasury-address
   * Returns the computed treasury Safe address (no deployment required).
   */
  router.get("/treasury-address", async (_req: Request, res: Response) => {
    try {
      const address = await getTreasurySafeAddress();
      res.json({ address });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * POST /payout/send
   * Generic token send from the treasury Safe.
   *
   * Body: { to, tokenAddress?, amount, decimals? }
   *   - tokenAddress: defaults to TREASURY_TOKEN_ADDRESS env var
   *   - decimals:     defaults to TREASURY_TOKEN_DECIMALS env var (18 if unset)
   */
  router.post("/send", async (req: Request, res: Response) => {
    const { to, tokenAddress: tokenAddressParam, amount, decimals: decimalsParam } = req.body ?? {};

    if (!to) {
      res.status(400).json({ error: "Missing required field: to" });
      return;
    }
    if (!amount) {
      res.status(400).json({ error: "Missing required field: amount" });
      return;
    }

    try {
      const { tokenAddress, decimals } = resolveToken(tokenAddressParam, decimalsParam);
      const txHash = await sendTokenFromTreasury(to as Address, tokenAddress, String(amount), decimals);
      res.json({ txHash });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Payout /send error:", message);
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /payout/campaign-claim
   * Pay out a pending campaign claim from the treasury Safe.
   *
   * Body: { campaignId, safeAddress, tokenAddress?, decimals? }
   *
   * The claim must exist and have status "pending".
   * On success, the claim status is updated to "paid".
   */
  router.post("/campaign-claim", async (req: Request, res: Response) => {
    const {
      campaignId,
      safeAddress,
      tokenAddress: tokenAddressParam,
      decimals: decimalsParam,
    } = req.body ?? {};

    if (!campaignId) {
      res.status(400).json({ error: "Missing required field: campaignId" });
      return;
    }
    if (!safeAddress) {
      res.status(400).json({ error: "Missing required field: safeAddress" });
      return;
    }

    try {
      const [campaign, claim] = await Promise.all([
        getCampaign(campaignId),
        getCampaignClaim(campaignId, safeAddress),
      ]);

      if (!campaign) {
        res.status(404).json({ error: "Campaign not found" });
        return;
      }
      if (!claim) {
        res.status(404).json({ error: "Claim not found for this safe address" });
        return;
      }
      if (claim.status !== "pending") {
        res.status(400).json({ error: `Claim is already ${claim.status}`, claim });
        return;
      }

      const { tokenAddress, decimals } = resolveToken(tokenAddressParam, decimalsParam);
      const txHash = await sendTokenFromTreasury(
        safeAddress as Address,
        tokenAddress,
        claim.token_amount,
        decimals
      );

      await updateCampaignClaim(campaignId, safeAddress, {
        status: "paid",
        tx_hash: txHash,
        paid_at: new Date().toISOString(),
      });

      res.json({
        status: "paid",
        campaignId,
        safeAddress,
        tokenAmount: claim.token_amount,
        txHash,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Payout /campaign-claim error:", message);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
