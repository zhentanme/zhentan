/**
 * Safe lifecycle routes for the SafeTx flow:
 *   POST /safe/deploy — eager deploy of a 2-of-3 Safe (agent pays gas)
 *   GET  /safe/nonce  — next unused Safe nonce (Transaction Service aware)
 */
import { Router, type Request, type Response, type IRouter } from "express";

import { assertCanonical, SAFE_2OF3_THRESHOLD } from "../lib/safe/owners.js";
import { deploySafe, computeCounterfactual } from "../lib/safe/deploy.js";
import { getNextSafeNonce } from "../lib/safe/service.js";
import { getAgentAddress } from "../lib/safe/relayer.js";
import { getUserDetails, upsertUserDetails } from "../lib/supabase/index.js";

export function createSafeRouter(): IRouter {
  const router = Router();

  router.get("/nonce", async (req: Request, res: Response) => {
    const safe = req.query.safe as string | undefined;
    if (!safe) {
      res.status(400).json({ error: "Missing required query param: safe" });
      return;
    }
    try {
      const nonce = await getNextSafeNonce(safe);
      res.json({ nonce });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/deploy", async (req: Request, res: Response) => {
    const { ownerAddresses } = req.body ?? {};
    if (!Array.isArray(ownerAddresses)) {
      res.status(400).json({ error: "Missing required field: ownerAddresses" });
      return;
    }

    try {
      assertCanonical(ownerAddresses, getAgentAddress());

      // The address is recomputed server-side — the client never dictates
      // where a deploy lands.
      const { address } = await computeCounterfactual(ownerAddresses);

      // If the caller already has a Safe record it must match; a mismatch
      // means the owner set diverged from what was registered.
      const existing = await getUserDetails(address);
      const callerRecord = req.user;
      if (
        callerRecord &&
        callerRecord.safe_address.toLowerCase() !== address.toLowerCase()
      ) {
        res.status(409).json({
          error: `Owner set derives ${address}, but your registered Safe is ${callerRecord.safe_address}`,
        });
        return;
      }

      const result = await deploySafe(ownerAddresses);

      await upsertUserDetails(address, {
        safe_owners: ownerAddresses,
        safe_threshold: SAFE_2OF3_THRESHOLD,
        safe_deployed: true,
        ...(result.txHash && { safe_deploy_tx_hash: result.txHash }),
        ...(existing === null && { execution_mode: "safetx" }),
      });

      res.json({
        success: true,
        safeAddress: result.address,
        alreadyDeployed: !result.deployed,
        ...(result.txHash && { txHash: result.txHash }),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
