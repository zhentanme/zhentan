import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callApi, ApiTimeoutError } from "../api.js";
import { ok, fail, failFrom } from "../result.js";

// All new ids mint as tx-XXXXXXXX; swap- and req-tx- are legacy prefixes still
// present on rows queued before ids were unified.
const TX_ID = z
  .string()
  .regex(/^(tx|swap|req-tx)-[a-z0-9-]+$/i, "txId must look like tx-XXXXXXXX");
// Required on every Safe-scoped tool, not just the ones that omit a txId. The
// server authorizes each call against the Safe this resolves to, so a call
// without it has no principal and is refused.
const CALLER_ID = z
  .string()
  .regex(/^telegram:\d+$/, 'callerId must be "telegram:<numeric user id>"')
  .describe("Telegram caller identity from session context, e.g. telegram:593960240");

interface TxStatus {
  transaction?: {
    id: string;
    status?: string;
    txHash?: string;
    rejected?: boolean;
    inReview?: boolean;
    executedAt?: string;
    riskScore?: number;
    riskVerdict?: string;
    riskReasons?: string[];
    to?: string;
    amount?: string;
    token?: string;
  };
}

async function fetchStatus(txId: string, callerId: string) {
  const { transaction } = await callApi<TxStatus>(
    "GET",
    `/transactions/${encodeURIComponent(txId)}`,
    undefined,
    30_000,
    callerId,
  );
  return transaction;
}

/**
 * On-chain inclusion can outlive the HTTP call. If /execute times out, the
 * server usually finished anyway — poll the transaction status instead of
 * failing (and NEVER re-submit).
 */
async function recoverAfterTimeout(txId: string, callerId: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((r) => setTimeout(r, 5_000));
    try {
      const tx = await fetchStatus(txId, callerId);
      if (tx?.txHash) {
        return ok({
          status: "executed",
          txId,
          txHash: tx.txHash,
          note: "The execute call timed out but the transaction completed on-chain.",
        });
      }
      if (tx?.rejected) {
        return ok({ status: "rejected", txId });
      }
    } catch {
      // transient — keep polling
    }
  }
  return fail(
    `The execute call for ${txId} timed out and the transaction has not confirmed yet. ` +
      `Do NOT call execute_transaction again — use check_transaction_status in a minute to get the outcome.`,
  );
}

export function registerTransactionTools(server: McpServer) {
  server.registerTool(
    "execute_transaction",
    {
      title: "Approve & execute transaction",
      description:
        "Co-sign and execute a pending Safe transaction on-chain. IRREVERSIBLE — moves funds. " +
        "Call ONLY when the user explicitly asked to APPROVE. Never call this for a reject — use reject_transaction. " +
        "Omit txId to execute the user's most recent in-review transaction. " +
        "Waits for on-chain inclusion; on timeout it automatically checks the real outcome.",
      inputSchema: {
        txId: TX_ID.optional().describe("Transaction id, e.g. tx-cc34ee59. Omit to target the latest in-review tx."),
        callerId: CALLER_ID,
      },
    },
    async ({ txId, callerId }) => {
      try {
        const result = await callApi(
          "POST",
          "/execute",
          { ...(txId ? { txId } : {}), callerId },
          150_000,
          callerId,
        );
        return ok(result);
      } catch (err) {
        if (err instanceof ApiTimeoutError && txId) {
          return recoverAfterTimeout(txId, callerId);
        }
        if (err instanceof ApiTimeoutError) {
          return fail(
            "The execute call timed out and no txId was provided, so the outcome can't be auto-checked. " +
              "Do NOT call execute_transaction again — ask the user to check their dashboard, or find the txId and use check_transaction_status.",
          );
        }
        return failFrom(err);
      }
    },
  );

  server.registerTool(
    "reject_transaction",
    {
      title: "Reject transaction",
      description:
        "Reject a pending in-review Safe transaction so it will NOT execute. No funds move. " +
        "Use whenever the user says reject/deny/block a transaction. " +
        "Omit txId to reject the user's most recent in-review transaction.",
      inputSchema: {
        txId: TX_ID.optional().describe("Transaction id to reject. Omit to target the latest in-review tx."),
        reason: z.string().max(500).optional().describe("Why it was rejected (shown to the user)."),
        callerId: CALLER_ID,
      },
    },
    async ({ txId, reason, callerId }) => {
      try {
        const id = txId ?? "latest";
        const result = await callApi(
          "PATCH",
          `/transactions/${encodeURIComponent(id)}`,
          { action: "reject", reason: reason ?? "Rejected by owner", callerId },
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
    "review_transaction",
    {
      title: "Mark transaction for review",
      description:
        "Flag a pending Safe transaction for manual review. Does not execute or reject it. " +
        "Omit txId to target the user's most recent in-review transaction.",
      inputSchema: {
        txId: TX_ID.optional(),
        reason: z.string().max(500).optional(),
        callerId: CALLER_ID,
      },
    },
    async ({ txId, reason, callerId }) => {
      try {
        const id = txId ?? "latest";
        const result = await callApi(
          "PATCH",
          `/transactions/${encodeURIComponent(id)}`,
          { action: "review", reason: reason ?? "Flagged for manual review", callerId },
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
    "check_transaction_status",
    {
      title: "Check transaction status",
      description:
        "Fetch the current status of a transaction: pending / in_review / executed (with txHash) / rejected, " +
        "plus risk score, verdict and reasons. Use after an execute timeout, or whenever the user asks about a transaction.",
      inputSchema: {
        txId: TX_ID.describe("Transaction id, e.g. tx-cc34ee59"),
        callerId: CALLER_ID,
      },
    },
    async ({ txId, callerId }) => {
      try {
        const tx = await fetchStatus(txId, callerId);
        if (!tx) return fail(`Transaction ${txId} not found.`);
        return ok(tx);
      } catch (err) {
        return failFrom(err);
      }
    },
  );

  server.registerTool(
    "list_transactions",
    {
      title: "List transactions for a Safe",
      description:
        "List transactions for a Safe address (newest first), trimmed to the essentials. " +
        'Use for "check pending" / "show my transactions". Set onlyOpen to true to show only ' +
        "transactions that have not executed and are not rejected.",
      inputSchema: {
        callerId: CALLER_ID,
        onlyOpen: z.boolean().optional().describe("true = only not-yet-executed, not-rejected transactions"),
      },
    },
    async ({ callerId, onlyOpen }) => {
      try {
        // No safeAddress: the server lists the Safe the callerId resolves to.
        const { transactions } = await callApi<{ transactions: Record<string, unknown>[] }>(
          "GET",
          "/transactions",
          undefined,
          30_000,
          callerId,
        );
        let list = (transactions ?? []).map((t) => ({
          id: t.id,
          status: t.status,
          to: t.to,
          amount: t.amount,
          token: t.token,
          proposedAt: t.proposedAt,
          riskScore: t.riskScore,
          riskVerdict: t.riskVerdict,
          inReview: t.inReview,
          rejected: t.rejected,
          executedAt: t.executedAt,
          txHash: t.txHash,
        }));
        if (onlyOpen) {
          list = list.filter((t) => !t.executedAt && !t.rejected && t.id);
        }
        return ok({ count: list.length, transactions: list });
      } catch (err) {
        return failFrom(err);
      }
    },
  );

  server.registerTool(
    "analyze_transaction",
    {
      title: "Deep security analysis",
      description:
        "Run a deep security analysis of a transaction: recipient history, address security (GoPlus), " +
        "token safety, honeypot simulation, and an overall verdict with flags. " +
        "Omit txId to analyze the user's most recent in-review transaction. " +
        "External scanners are involved — this can take ~20 seconds.",
      inputSchema: {
        txId: TX_ID.optional(),
        callerId: CALLER_ID,
      },
    },
    async ({ txId, callerId }) => {
      try {
        const id = txId ?? "latest";
        const result = await callApi(
          "GET",
          `/analyze/${encodeURIComponent(id)}`,
          undefined,
          60_000,
          callerId,
        );
        return ok(result);
      } catch (err) {
        return failFrom(err);
      }
    },
  );

  server.registerTool(
    "resolve_notification",
    {
      title: "Resolve Telegram notification",
      description:
        "Update the pending Telegram notification message after a transaction was approved or rejected. " +
        "Call this right after execute_transaction succeeds (action approved, include txHash) or after " +
        "reject_transaction (action rejected).",
      inputSchema: {
        txId: TX_ID,
        action: z.enum(["approved", "rejected"]),
        txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().describe("On-chain hash (for approved)"),
        callerId: CALLER_ID,
      },
    },
    async ({ callerId, ...args }) => {
      try {
        const result = await callApi(
          "POST",
          "/notify-resolve",
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
