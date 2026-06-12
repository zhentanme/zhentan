import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callApi, ApiError } from "../api.js";
import { ok, fail, failFrom } from "../result.js";

export function registerResolveTools(server: McpServer) {
  server.registerTool(
    "resolve_recipient",
    {
      title: "Resolve recipient name to address",
      description:
        "Resolve a recipient into a wallet address. Accepts a raw 0x address (validated and passed through), " +
        "an ENS name (alice.eth), a SPACE ID name (alice.bnb), or a Zhentan username. " +
        'Use whenever the user names a recipient instead of giving an address ("pay alice.eth", "send 50 USDC to @koshik") ' +
        "BEFORE calling queue_request. Returns the address and which source resolved it — " +
        "always show the user the resolved address for confirmation before queueing a payment.",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .max(255)
          .describe("0x address, ENS (.eth), SPACE ID (.bnb), or Zhentan username"),
      },
    },
    async ({ name }) => {
      try {
        const result = await callApi<{ address: string; name?: string; source: string }>(
          "GET",
          `/resolve?name=${encodeURIComponent(name.trim())}`,
          undefined,
          45_000, // ENS/SPACE ID resolution walks RPC fallbacks — give it room
        );
        return ok(result);
      } catch (err) {
        if (err instanceof ApiError && err.status && err.status < 500) {
          return fail(
            `Could not resolve "${name}" (supported: 0x address, .eth, .bnb, or a Zhentan username). ` +
              `Ask the user to double-check the name or provide the address directly.`,
          );
        }
        return failFrom(err);
      }
    },
  );
}
