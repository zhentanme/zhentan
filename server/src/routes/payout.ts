import { Router, type Request, type Response, type NextFunction, type IRouter } from "express";
import type { Address } from "viem";
import { getTreasurySafeAddress, sendTokenFromTreasury } from "../lib/treasury.js";

// ─── Admin auth ───────────────────────────────────────────────────────────────

function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    res.status(500).json({ error: "ADMIN_API_KEY is not configured" });
    return;
  }
  if (req.headers["x-admin-key"] !== adminKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ─── Token resolver ───────────────────────────────────────────────────────────

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

  router.use(adminAuth);

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
   * Body: { to, amount, tokenAddress?, decimals? }
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

  return router;
}
