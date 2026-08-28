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
      title: "Queue a payment or swap request",
      description:
        "Queue an incoming request (a parsed invoice, a transfer instruction, or a token swap) to the user's " +
        "Zhentan dashboard for approval. This does NOT move funds — the user approves it in the app. " +
        "Use when the user forwards an invoice, asks to send/pay someone, or asks to swap tokens. " +
        'For swaps set kind: "swap" with fromToken/toToken (symbols) and amount = sell amount; ' +
        "to/token are not used and invoice fields are invalid.",
      inputSchema: {
        type: z.enum(["invoice", "transfer"]).optional().describe('"invoice" for invoice documents, "transfer" for send/pay instructions. Omit for swaps.'),
        kind: z
          .enum(["transfer", "swap"])
          .optional()
          .describe('How the request settles on-chain. Default "transfer" (invoices are always transfers); "swap" for token swaps.'),
        to: ADDRESS.optional().describe("Recipient wallet address (required unless kind is swap)"),
        amount: z.string().regex(/^\d+(\.\d+)?$/, "amount must be a positive decimal string").describe("Transfer amount, or the SELL amount for swaps"),
        token: z.string().min(1).optional().describe('Token symbol, e.g. "USDC" (required unless kind is swap)'),
        fromToken: z.string().min(1).optional().describe('Swaps only: sell-token symbol, e.g. "USDC"'),
        toToken: z
          .string()
          .min(1)
          .optional()
          .describe(
            'Swaps only: buy-token symbol (e.g. "WBNB") or its 0x contract address — pass the address from search_token for unfamiliar/ambiguous tokens so the swap targets exactly the token the user confirmed',
          ),
        slippage: z
          .number()
          .min(0.0001)
          .max(0.5)
          .optional()
          .describe("Swaps only: slippage as a fraction (0.005 = 0.5%). Default 0.005."),
        callerId: CALLER_ID.describe("Required — resolves which user's Safe owns this request"),
        description: z
          .string()
          .min(1)
          .max(500)
          .describe(
            "REQUIRED for every kind (transfer, swap, invoice): the user's instruction in their own " +
              'words, as close to verbatim as possible — e.g. "send all my USDC to alice.eth", ' +
              '"swap 10 USDC for WBNB", "pay this invoice from Acme". Shown to the user as the ' +
              "Instruction on the request.",
          ),
        invoiceNumber: z.string().optional(),
        issueDate: z.string().optional(),
        dueDate: z.string().optional(),
        billedFrom: PARTY.optional(),
        billedTo: PARTY.optional(),
        services: z.array(SERVICE).optional(),
        riskScore: z
          .number()
          .int()
          .min(0)
          .max(100)
          .optional()
          .describe(
            "CONTEXTUAL risk only (0–100), and only when you see a red flag the server cannot: " +
              "a suspicious invoice, a social-engineering smell, a resolved name that doesn't match its address. " +
              "The server already scores recipient history, amounts, velocity and time-of-day deterministically — " +
              "do NOT re-derive those factors. Your score can only raise the server's, never lower it. " +
              "Omit entirely for routine requests.",
          ),
        riskNotes: z
          .string()
          .max(500)
          .optional()
          .describe("One line naming the contextual red flag. Required when riskScore is set."),
      },
    },
    async ({ callerId, ...args }) => {
      try {
        const result = await callApi(
          "POST",
          "/requests",
          { ...args, callerId, sourceChannel: "telegram" },
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
        const result = await callApi("GET", "/requests", undefined, 30_000, callerId);
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
        callerId: CALLER_ID.describe("Required — scopes the update to this user's Safe"),
      },
    },
    async ({ callerId, ...args }) => {
      try {
        const result = await callApi(
          "PATCH",
          "/requests",
          { ...args, callerId },
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
