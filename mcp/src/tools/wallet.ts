import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callApi } from "../api.js";
import { ok, failFrom } from "../result.js";

const CALLER_ID = z
  .string()
  .regex(/^telegram:\d+$/, 'callerId must be "telegram:<numeric user id>"')
  .describe("Telegram caller identity from session context, e.g. telegram:593960240");

interface PortfolioToken {
  symbol: string;
  name: string;
  balance: string;
  usdValue: number | null;
  price: number;
  verified: boolean;
  address: string | null;
}

interface PortfolioResponse {
  tokens: PortfolioToken[];
  totalUsd: number;
  percentChange24h: number | null;
}

export function registerWalletTools(server: McpServer) {
  server.registerTool(
    "get_portfolio",
    {
      title: "Get wallet balances",
      description:
        "Fetch the user's live Safe portfolio: every token they hold with its exact balance, USD value " +
        "and price, plus the total. Use for balance questions (\"what do I have\", \"how much USDC\") and " +
        "ALWAYS before dynamic amounts — \"send ALL my USDC\", \"swap half my USDT\" — so the amount you " +
        "queue comes from the live balance, never from guesswork or an earlier message.",
      inputSchema: {
        callerId: CALLER_ID,
      },
    },
    async ({ callerId }) => {
      try {
        const portfolio = await callApi<PortfolioResponse>(
          "GET",
          "/me/portfolio",
          undefined,
          45_000,
          callerId,
        );
        // Trim to what the model needs — icons and chart fields are noise here.
        return ok({
          totalUsd: portfolio.totalUsd,
          percentChange24h: portfolio.percentChange24h,
          tokens: portfolio.tokens.map((t) => ({
            symbol: t.symbol,
            name: t.name,
            balance: t.balance,
            usdValue: t.usdValue,
            price: t.price,
            verified: t.verified,
            address: t.address,
          })),
        });
      } catch (err) {
        return failFrom(err);
      }
    },
  );

  server.registerTool(
    "quote_request",
    {
      title: "Preview a request's outcome (read-only)",
      description:
        "Preview what a transfer or swap request WOULD do before queueing it: resolved tokens, balance " +
        "sufficiency, live swap route with expected output and USD values, plus the risk score/verdict " +
        "the request would get (including whether it would auto-execute). Read-only — it never queues, " +
        "signs, or moves anything. Takes the same settlement fields as queue_request. Use it to answer " +
        '"how much USDT would I get for my USDC" and to show the outcome before queueing; then call ' +
        "queue_request to actually queue. Swap routes go stale in minutes — do not quote once and queue " +
        "much later.",
      inputSchema: {
        kind: z
          .enum(["transfer", "swap"])
          .optional()
          .describe('How the request settles on-chain. Default "transfer"; "swap" for token swaps.'),
        to: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "must be a 0x… EVM address")
          .optional()
          .describe("Transfers: recipient wallet address"),
        amount: z
          .string()
          .regex(/^\d+(\.\d+)?$/, "amount must be a positive decimal string")
          .describe("Transfer amount, or the SELL amount for swaps"),
        token: z.string().min(1).optional().describe('Transfers: token symbol, e.g. "USDC"'),
        fromToken: z.string().min(1).optional().describe('Swaps only: sell-token symbol, e.g. "USDC"'),
        toToken: z.string().min(1).optional().describe('Swaps only: buy-token symbol, e.g. "USDT"'),
        slippage: z
          .number()
          .min(0.0001)
          .max(0.5)
          .optional()
          .describe("Swaps only: slippage as a fraction (0.005 = 0.5%). Omit for the default ladder."),
        callerId: CALLER_ID,
      },
    },
    async ({ callerId, ...args }) => {
      try {
        const result = await callApi(
          "POST",
          "/requests/quote",
          { ...args, callerId },
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
    "search_token",
    {
      title: "Search BNB Chain tokens",
      description:
        "Search BNB Chain tokens by symbol or name (market-cap sorted). Use to disambiguate a token the " +
        "user names before quoting or queueing a swap into it — especially unfamiliar tokens, where " +
        "several contracts can share one symbol. Show the user the resolved name + address when it matters.",
      inputSchema: {
        query: z.string().min(1).max(100).describe('Token symbol or name, e.g. "USDT" or "PancakeSwap"'),
      },
    },
    async ({ query }) => {
      try {
        const { tokens } = await callApi<{
          tokens: { symbol: string; name: string; address: string | null; decimals: number }[];
        }>("GET", `/tokens/search?q=${encodeURIComponent(query.trim())}`, undefined, 30_000);
        return ok({
          tokens: tokens.slice(0, 10).map((t) => ({
            symbol: t.symbol,
            name: t.name,
            address: t.address,
            decimals: t.decimals,
          })),
        });
      } catch (err) {
        return failFrom(err);
      }
    },
  );
}
