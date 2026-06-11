import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callApi } from "../api.js";
import { ok, fail, failFrom } from "../result.js";

const ADDRESS = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "must be a 0x… EVM address");
const CALLER_ID = z
  .string()
  .regex(/^telegram:\d+$/, 'callerId must be "telegram:<numeric user id>"');

export function registerScreeningTools(server: McpServer) {
  server.registerTool(
    "update_screening_settings",
    {
      title: "Update screening settings",
      description:
        "Toggle screening mode and/or update per-Safe limits and risk thresholds. " +
        "Provide only the fields to change. Use when the user says enable/disable screening or update limits.",
      inputSchema: {
        safe: ADDRESS.describe("The user's Safe address"),
        screeningMode: z.boolean().optional().describe("true = screening on, false = off"),
        maxSingleTx: z.string().regex(/^\d+(\.\d+)?$/).optional(),
        maxDailyVolume: z.string().regex(/^\d+(\.\d+)?$/).optional(),
        riskThresholdApprove: z.number().int().min(0).max(100).optional(),
        riskThresholdBlock: z.number().int().min(0).max(100).optional(),
        learningEnabled: z.boolean().optional(),
        callerId: CALLER_ID.optional(),
      },
    },
    async ({ safe, callerId, ...settings }) => {
      const changes = Object.entries(settings).filter(([, v]) => v !== undefined);
      if (changes.length === 0) {
        return fail("Provide at least one setting to change (screeningMode, maxSingleTx, riskThresholdApprove, …).");
      }
      try {
        const result = await callApi("PATCH", "/status", {
          safe,
          ...Object.fromEntries(changes),
          ...(callerId ? { callerId } : {}),
        });
        return ok(result);
      } catch (err) {
        return failFrom(err);
      }
    },
  );
}
