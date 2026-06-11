#!/usr/bin/env node
/**
 * Zhentan MCP server entry point.
 *
 * Transport is selected by MCP_TRANSPORT (default: stdio).
 * - stdio: spawned as a subprocess by the MCP host (nanobot, Claude Desktop, …)
 * - http (future): streamable HTTP for remote hosts — see the tracking issue;
 *   requires bearer auth on the endpoint before it can be enabled.
 *
 * Required env: AGENT_SECRET. Optional: ZHENTAN_API_URL (defaults to production).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";

async function main() {
  const transport = process.env.MCP_TRANSPORT ?? "stdio";

  if (transport !== "stdio") {
    // Streamable HTTP slot: implement with StreamableHTTPServerTransport +
    // auth middleware, reusing buildServer() unchanged.
    console.error(`Unsupported MCP_TRANSPORT "${transport}" — only "stdio" is implemented.`);
    process.exit(1);
  }

  const server = buildServer();
  await server.connect(new StdioServerTransport());
  // stdio note: stdout is the protocol channel — only ever log to stderr.
  console.error("zhentan-mcp ready (stdio)");
}

main().catch((err) => {
  console.error("zhentan-mcp failed to start:", err);
  process.exit(1);
});
