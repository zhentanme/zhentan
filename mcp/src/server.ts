import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTransactionTools } from "./tools/transactions.js";
import { registerRequestTools } from "./tools/requests.js";
import { registerScreeningTools } from "./tools/screening.js";
import { registerProfileTools } from "./tools/profile.js";
import { registerResolveTools } from "./tools/resolve.js";
import { registerRuleTools } from "./tools/rules.js";

/**
 * Build the Zhentan MCP server with all tools registered.
 *
 * Transport-agnostic on purpose: callers attach a transport (stdio today;
 * streamable HTTP later) via `server.connect(transport)`. Adding a new
 * transport must never require touching tool code.
 */
export function buildServer(): McpServer {
  const server = new McpServer({
    name: "zhentan",
    version: "0.1.0",
  });

  registerTransactionTools(server);
  registerRequestTools(server);
  registerScreeningTools(server);
  registerProfileTools(server);
  registerResolveTools(server);
  registerRuleTools(server);

  return server;
}
