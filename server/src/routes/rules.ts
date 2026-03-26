import { Router, Request, Response, type IRouter } from "express";
import {
  getUserRules,
  createUserRule,
  updateUserRule,
  deleteUserRule,
} from "../lib/supabase/index.js";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const VALID_RULE_TYPES = [
  "amount_limit",
  "recipient_block",
  "recipient_whitelist",
  "time_restriction",
  "velocity_limit",
  "token_restriction",
  "custom",
] as const;

const VALID_ACTIONS = ["approve", "review", "block"] as const;

export function createRulesRouter(): IRouter {
  const router = Router();

  // GET /rules?safe=0x...
  // Returns all active rules for a Safe, sorted by priority.
  router.get("/", async (req: Request, res: Response) => {
    try {
      const safe = req.query.safe as string | undefined;
      if (!safe || !ADDRESS_RE.test(safe)) {
        res.status(400).json({ error: "Missing or invalid safeAddress" });
        return;
      }

      const rules = await getUserRules(safe);
      res.json({ rules });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // POST /rules
  // Creates a new custom rule for a Safe.
  // Body: { safe, name, ruleType, conditions, action, riskScoreDelta?, priority?, description? }
  router.post("/", async (req: Request, res: Response) => {
    try {
      const {
        safe,
        name,
        ruleType,
        conditions,
        action,
        riskScoreDelta = 0,
        priority = 100,
        description,
      } = req.body ?? {};

      if (!safe || !ADDRESS_RE.test(safe)) {
        res.status(400).json({ error: "Missing or invalid safe address" });
        return;
      }
      if (!name || typeof name !== "string") {
        res.status(400).json({ error: "Missing required field: name" });
        return;
      }
      if (!VALID_RULE_TYPES.includes(ruleType)) {
        res.status(400).json({ error: `Invalid ruleType. Must be one of: ${VALID_RULE_TYPES.join(", ")}` });
        return;
      }
      if (!VALID_ACTIONS.includes(action)) {
        res.status(400).json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` });
        return;
      }
      if (conditions === undefined || typeof conditions !== "object") {
        res.status(400).json({ error: "conditions must be a JSON object" });
        return;
      }

      const rule = await createUserRule(safe, {
        name,
        description: description ?? null,
        rule_type: ruleType,
        conditions,
        action,
        risk_score_delta: Number(riskScoreDelta),
        priority: Number(priority),
        is_active: true,
      });

      res.status(201).json({ rule });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // PATCH /rules/:id
  // Updates a rule (any field except id/safe_address).
  router.patch("/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, ruleType, conditions, action, riskScoreDelta, priority, description, isActive } =
        req.body ?? {};

      if (!id) {
        res.status(400).json({ error: "Missing rule id" });
        return;
      }

      const patch: Parameters<typeof updateUserRule>[1] = {};

      if (name !== undefined)            patch.name              = name;
      if (description !== undefined)     patch.description       = description;
      if (conditions !== undefined)      patch.conditions        = conditions;
      if (riskScoreDelta !== undefined)  patch.risk_score_delta  = Number(riskScoreDelta);
      if (priority !== undefined)        patch.priority          = Number(priority);
      if (isActive !== undefined)        patch.is_active         = Boolean(isActive);

      if (ruleType !== undefined) {
        if (!VALID_RULE_TYPES.includes(ruleType)) {
          res.status(400).json({ error: `Invalid ruleType` });
          return;
        }
        patch.rule_type = ruleType;
      }
      if (action !== undefined) {
        if (!VALID_ACTIONS.includes(action)) {
          res.status(400).json({ error: `Invalid action` });
          return;
        }
        patch.action = action;
      }

      if (Object.keys(patch).length === 0) {
        res.status(400).json({ error: "No valid fields to update" });
        return;
      }

      await updateUserRule(id, patch);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // DELETE /rules/:id
  // Soft-deletes a rule (sets is_active = false).
  router.delete("/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "Missing rule id" });
        return;
      }

      await deleteUserRule(id);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
