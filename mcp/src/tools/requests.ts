import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callApi } from "../api.js";
import { ok, failFrom } from "../result.js";

const ADDRESS = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "must be a 0x… EVM address");
const CALLER_ID = z
  .string()
  .regex(/^telegram:\d+$/, 'callerId must be "telegram:<numeric user id>"');
const REQUEST_ID = z.string().regex(/^(req|inv)-[a-z0-9-]+$/i, "request id looks like req-XXXXXXXX");

const SERVICE = z.object({
  description: z.string(),
  qty: z.number(),
  rate: z.string(),
  total: z.string(),
});

const PARTY = z.object({
  name: z.string(),
  email: z.string().optional(),
  address: z.string().optional(),
});

export function registerRequestTools(server: McpServer) {
  server.registerTool(
    "queue_request",
    {
      title: "Queue a payment request",
      description:
        "Queue an incoming payment request (a parsed invoice or a general transfer instruction) to the user's " +
        "Zhentan dashboard for approval. This does NOT move funds — the user approves it in the app. " +
        "Use when the user forwards an invoice or asks to send/pay someone.",
      inputSchema: {
        type: z.enum(["invoice", "transfer"]).describe('"invoice" for invoice documents, "transfer" for send/pay instructions'),
        to: ADDRESS.describe("Recipient wallet address"),
        amount: z.string().regex(/^\d+(\.\d+)?$/, "amount must be a positive decimal string"),
        token: z.string().min(1).describe('Token symbol, e.g. "USDC"'),
        callerId: CALLER_ID.describe("Required — resolves which user's Safe owns this request"),
        description: z.string().max(500).optional().describe("For transfers: the user's instruction in one sentence"),
        invoiceNumber: z.string().optional(),
        issueDate: z.string().optional(),
        dueDate: z.string().optional(),
        billedFrom: PARTY.optional(),
        billedTo: PARTY.optional(),
        services: z.array(SERVICE).optional(),
        riskScore: z.number().int().min(0).max(100).optional(),
        riskNotes: z.string().max(500).optional(),
      },
    },
    async (args) => {
      try {
        const result = await callApi("POST", "/requests", { ...args, sourceChannel: "telegram" });
        return ok(result);
      } catch (err) {
        return failFrom(err);
      }
    },
  );

  server.registerTool(
    "list_requests",
    {
      title: "List payment requests",
      description: "List the user's queued/approved/executed/rejected payment requests (invoices and transfers).",
      inputSchema: {
        callerId: CALLER_ID.describe("Scopes the list to this user's Safe"),
      },
    },
    async ({ callerId }) => {
      try {
        const result = await callApi("GET", `/requests?callerId=${encodeURIComponent(callerId)}`);
        return ok(result);
      } catch (err) {
        return failFrom(err);
      }
    },
  );

  server.registerTool(
    "update_request_status",
    {
      title: "Update payment request status",
      description:
        "Update a queued payment request's status (approved / executed / rejected). " +
        "This updates bookkeeping only — it does not execute anything on-chain.",
      inputSchema: {
        id: REQUEST_ID.describe("Request id, e.g. req-1a2b3c4d"),
        status: z.enum(["queued", "approved", "executed", "rejected"]),
        txId: z.string().optional().describe("Associated transaction id when approving"),
        txHash: z.string().optional().describe("On-chain hash when marking executed"),
        rejectReason: z.string().max(500).optional(),
        callerId: CALLER_ID.optional(),
      },
    },
    async (args) => {
      try {
        const result = await callApi("PATCH", "/requests", { ...args });
        return ok(result);
      } catch (err) {
        return failFrom(err);
      }
    },
  );
}
