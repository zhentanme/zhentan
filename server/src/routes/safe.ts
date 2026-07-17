/**
 * Safe lifecycle routes for the SafeTx flow:
 *   POST /safe/derive — counterfactual address for a canonical owner set
 *                       (all derivation is server-side; see lib/safe/derive.ts)
 *   POST /safe/deploy — eager deploy of a 2-of-3 Safe (agent pays gas)
 *   GET  /safe/nonce  — next unused Safe nonce (Transaction Service aware)
 */
import { Router, type Request, type Response, type IRouter } from "express";

import { assertCanonical, SAFE_2OF3_THRESHOLD } from "../lib/safe/owners.js";
import { PROFILES, classifyProfile, type WalletProfile } from "../lib/safe/profiles.js";
import { deploySafe, computeCounterfactual } from "../lib/safe/deploy.js";
import {
  getDefaultDerivationVersion,
  type DerivationVersion,
} from "../lib/safe/derive.js";
import { getNextSafeNonce } from "../lib/safe/service.js";
import { getAgentAddress } from "../lib/safe/relayer.js";
import { getUserDetails, upsertUserDetails, setCreationSnapshot } from "../lib/supabase/index.js";
import { DEFAULT_SALT_NONCE } from "../lib/safe/derive.js";

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
  // Takes the chosen wallet profile (creation recipe) + the user's addresses;
  // owners are BUILT server-side so ordering and membership can't be spoofed.
  // Returning users are resolved from their record before this is ever called.
  router.post("/derive", async (req: Request, res: Response) => {
    const {
      profile = "protected",
      embeddedAddress,
      backupAddress,
      // Back-compat: pre-profiles clients sent the canonical owner array.
      ownerAddresses,
    } = req.body ?? {};

    try {
      const agent = getAgentAddress();
      let owners: string[];
      let threshold: number;

      if (Array.isArray(ownerAddresses)) {
        assertCanonical(ownerAddresses, agent);
        owners = ownerAddresses;
        threshold = SAFE_2OF3_THRESHOLD;
      } else {
        const recipe = PROFILES[profile as WalletProfile];
        if (!recipe) {
          res.status(400).json({ error: `Unknown profile: ${profile}` });
          return;
        }
        if (typeof embeddedAddress !== "string") {
          res.status(400).json({ error: "Missing required field: embeddedAddress" });
          return;
        }
        owners = recipe.buildOwners({
          embedded: embeddedAddress,
          backup: typeof backupAddress === "string" ? backupAddress : undefined,
          agent,
        });
        recipe.validate(owners, agent);
        threshold = recipe.threshold;
      }

      const version = getDefaultDerivationVersion();
      const { address } = await computeCounterfactual(owners, threshold, version);
      res.json({
        safeAddress: address,
        owners,
        threshold,
        profile: Array.isArray(ownerAddresses) ? "protected" : profile,
        derivationVersion: version,
      });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.post("/deploy", async (req: Request, res: Response) => {
    const { ownerAddresses, threshold: rawThreshold } = req.body ?? {};
    if (!Array.isArray(ownerAddresses)) {
      res.status(400).json({ error: "Missing required field: ownerAddresses" });
      return;
    }

    try {
      const agent = getAgentAddress();
      const threshold = Number(rawThreshold ?? SAFE_2OF3_THRESHOLD);

      // The owner set + threshold must form a managed profile — deploys of
      // arbitrary configurations are refused.
      const state = classifyProfile(ownerAddresses, threshold, agent);
      if (state !== "starter" && state !== "guarded" && state !== "protected") {
        res.status(400).json({
          error: `Owner set/threshold do not form a managed wallet profile (${state})`,
        });
        return;
      }
      PROFILES[state].validate(ownerAddresses, agent);

      // The address is recomputed server-side with the caller's stored
      // derivation version (default for first-time deploys) — the client
      // never dictates where a deploy lands.
      const callerRecord = req.user;
      const version = (callerRecord?.derivation_version ??
        getDefaultDerivationVersion()) as DerivationVersion;
      const { address } = await computeCounterfactual(ownerAddresses, threshold, version);

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

      const result = await deploySafe(ownerAddresses, threshold, version);

      await upsertUserDetails(address, {
        safe_owners: ownerAddresses,
        safe_threshold: threshold,
        safe_deployed: true,
        derivation_version: version,
        ...(result.txHash && { safe_deploy_tx_hash: result.txHash }),
        ...(existing === null && { execution_mode: "safetx" }),
      });
      await setCreationSnapshot(address, {
        owners: ownerAddresses,
        threshold,
        saltNonce: DEFAULT_SALT_NONCE,
        derivationVersion: version,
      }).catch((err) => console.error("setCreationSnapshot failed:", err));

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
