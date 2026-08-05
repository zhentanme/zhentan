import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callApi } from "../api.js";
import { ok, failFrom } from "../result.js";

const RULE_ID = z.string().uuid("rule id is a UUID (from list_rules)");
// Required: the server scopes every rule operation to the Safe this resolves to.
const CALLER_ID = z
  .string()
  .regex(/^telegram:\d+$/, 'callerId must be "telegram:<numeric user id>"')
  .describe("Telegram caller identity from session context, e.g. telegram:593960240");

const RULE_TYPE = z.enum([
  "amount_limit",
  "recipient_block",
  "recipient_whitelist",
  "time_restriction",
  "velocity_limit",
  "token_restriction",
  "custom",
]);

const RULE_ACTION = z.enum(["approve", "review", "block"]);

const CONDITIONS_HINT =
  'Shape depends on ruleType: amount_limit {"max":"500","token":"USDC"} · recipient_block/whitelist {"address":"0x…"} · ' +
  'time_restriction {"hours":[0,1,2],"days":[6,0]} · velocity_limit {"window":"hourly","max_volume":"1000"} · ' +
  'token_restriction {"token":"0x…","action":"block"} · custom: any object';

export function registerRuleTools(server: McpServer) {
  server.registerTool(
    "list_rules",
    {
      title: "List screening rules",
      description: "List the custom screening rules for a Safe (id, type, conditions, action, priority, active).",
      inputSchema: {
        callerId: CALLER_ID,
      },
    },
    async ({ callerId }) => {
      try {
        const result = await callApi("GET", "/rules", undefined, 30_000, callerId);
        return ok(result);
      } catch (err) {
        return failFrom(err);
      }
    },
  );

  server.registerTool(
    "create_rule",
    {
      title: "Create screening rule",
      description:
        "Create a custom screening rule for a Safe. The risk engine evaluates active rules on every transaction; " +
        "the rule's action (approve/review/block) and riskScoreDelta influence the verdict. " +
        "Confirm the rule's effect with the user before creating block rules.",
      inputSchema: {
        callerId: CALLER_ID,
        name: z.string().min(1).max(120),
        ruleType: RULE_TYPE,
        conditions: z.record(z.unknown()).describe(CONDITIONS_HINT),
        action: RULE_ACTION,
        riskScoreDelta: z.number().int().min(-100).max(100).optional().describe("Added to the risk score when triggered (default 0)"),
        priority: z.number().int().min(0).optional().describe("Lower = evaluated first (default 100)"),
        description: z.string().max(500).optional(),
      },
    },
    async ({ callerId, ...args }) => {
      try {
        const result = await callApi("POST", "/rules", { ...args, callerId }, 30_000, callerId);
        return ok(result);
      } catch (err) {
        return failFrom(err);
      }
    },
  );

  server.registerTool(
    "update_rule",
    {
      title: "Update screening rule",
      description:
        "Update an existing rule — enable/disable (isActive), change priority, conditions, action, etc. " +
        "Get the rule id from list_rules first.",
      inputSchema: {
        id: RULE_ID,
        callerId: CALLER_ID,
        name: z.string().min(1).max(120).optional(),
        ruleType: RULE_TYPE.optional(),
        conditions: z.record(z.unknown()).optional().describe(CONDITIONS_HINT),
        action: RULE_ACTION.optional(),
        riskScoreDelta: z.number().int().min(-100).max(100).optional(),
        priority: z.number().int().min(0).optional(),
        description: z.string().max(500).optional(),
        isActive: z.boolean().optional(),
      },
    },
    async ({ id, callerId, ...patch }) => {
      try {
        const result = await callApi(
          "PATCH",
          `/rules/${encodeURIComponent(id)}`,
          { ...patch, callerId },
          30_000,
          callerId,
        );
        return ok(result);
      } catch (err) {
        return failFrom(err);
      }
    },
  );

  server.registerTool(
    "delete_rule",
    {
      title: "Delete screening rule",
      description:
        "Soft-delete (deactivate) a screening rule. Get the rule id from list_rules first, and confirm with " +
        "the user which rule they mean before deleting.",
      inputSchema: {
        id: RULE_ID,
        callerId: CALLER_ID,
      },
    },
    async ({ id, callerId }) => {
      try {
        const result = await callApi(
          "DELETE",
          `/rules/${encodeURIComponent(id)}`,
          undefined,
          30_000,
          callerId,
        );
        return ok(result);
      } catch (err) {
        return failFrom(err);
      }
    },
  );

  server.registerTool(
    "get_event_log",
    {
      title: "Get behavioral event log",
      description:
        "Fetch the behavioral event history for a Safe (proposals, approvals, rejections, rule triggers, " +
        "pattern updates) — newest first. Use when the user asks for activity history or an audit trail.",
      inputSchema: {
        callerId: CALLER_ID,
        limit: z.number().int().min(1).max(500).optional().describe("Max events to return (default 100)"),
      },
    },
    async ({ callerId, limit }) => {
      try {
        const result = await callApi(
          "GET",
          limit ? `/events?limit=${limit}` : "/events",
          undefined,
          30_000,
          callerId,
        );
        return ok(result);
      } catch (err) {
        return failFrom(err);
      }
    },
  );
}
