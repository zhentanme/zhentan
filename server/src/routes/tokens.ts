import { Router, type Request, type Response } from "express";
import { fetchTokenDetails, fetchTokenChartData } from "../lib/zerion.js";

export function createTokensRouter(): Router {
  const router = Router();

  /** GET /tokens/details/:tokenId?currency=usd
   *  Returns token details + all chart periods in parallel (same pattern as Brewit).
   */
  router.get("/details/:tokenId", async (req: Request, res: Response) => {
    const { tokenId } = req.params;
    const currency = (req.query.currency as string) || "usd";

    if (!tokenId) {
      res.status(400).json({ error: "Missing tokenId" });
      return;
    }

    try {
      const [tokenDetails, tokenChartData] = await Promise.all([
        fetchTokenDetails(tokenId, currency),
        fetchTokenChartData(tokenId, currency),
      ]);

      if (!tokenDetails) {
        res.status(404).json({ error: "Token not found" });
        return;
      }

      res.json({ tokenDetails, tokenChartData });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Token details error:", message);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
