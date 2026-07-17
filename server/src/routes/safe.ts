/**
 * Safe lifecycle routes for the SafeTx flow:
 *   POST /safe/derive — counterfactual address for a canonical owner set
 *                       (all derivation is server-side; see lib/safe/derive.ts)
 *   POST /safe/deploy — eager deploy of a 2-of-3 Safe (agent pays gas)
 *   GET  /safe/nonce  — next unused Safe nonce (Transaction Service aware)
 */
import { Router, type Request, type Response, type IRouter } from "express";

import { assertCanonical, SAFE_2OF3_THRESHOLD } from "../lib/safe/owners.js";
import { deploySafe, computeCounterfactual } from "../lib/safe/deploy.js";
import {
  getDefaultDerivationVersion,
  type DerivationVersion,
} from "../lib/safe/derive.js";
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

  // POST /safe/derive — the client's only source of counterfactual addresses.
  // New users get the configured default derivation; returning users are
  // resolved from their record before this is ever called.
  router.post("/derive", async (req: Request, res: Response) => {
    const { ownerAddresses } = req.body ?? {};
    if (!Array.isArray(ownerAddresses)) {
      res.status(400).json({ error: "Missing required field: ownerAddresses" });
      return;
    }
    try {
      assertCanonical(ownerAddresses, getAgentAddress());
      const version = getDefaultDerivationVersion();
      const { address } = await computeCounterfactual(
        ownerAddresses,
        SAFE_2OF3_THRESHOLD,
        version
      );
      res.json({
        safeAddress: address,
        derivationVersion: version,
        threshold: SAFE_2OF3_THRESHOLD,
      });
    } catch (err) {
      res.status(400).json({ error: String(err) });
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

      // The address is recomputed server-side with the caller's stored
      // derivation version (default for first-time deploys) — the client
      // never dictates where a deploy lands.
      const callerRecord = req.user;
      const version = (callerRecord?.derivation_version ??
        getDefaultDerivationVersion()) as DerivationVersion;
      const { address } = await computeCounterfactual(
        ownerAddresses,
        SAFE_2OF3_THRESHOLD,
        version
      );

      // If the caller already has a Safe record it must match; a mismatch
      // means the owner set diverged from what was registered.
      const existing = await getUserDetails(address);
      if (
        callerRecord &&
        callerRecord.safe_address.toLowerCase() !== address.toLowerCase()
      ) {
        res.status(409).json({
          error: `Owner set derives ${address}, but your registered Safe is ${callerRecord.safe_address}`,
        });
        return;
      }

      const result = await deploySafe(ownerAddresses, SAFE_2OF3_THRESHOLD, version);

      await upsertUserDetails(address, {
        safe_owners: ownerAddresses,
        safe_threshold: SAFE_2OF3_THRESHOLD,
        safe_deployed: true,
        derivation_version: version,
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
