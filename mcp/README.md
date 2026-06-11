# zhentan-mcp

Typed MCP tools for the Zhentan agent. A **pure client** of the existing Zhentan
server API — no endpoint changes; the markdown skill's curl commands keep working
in parallel, so rollback is just removing the MCP config block.

Why this exists: with curl-based skills the model composes endpoints and auth
headers itself, which produced three real incidents — a reject routed to
`/execute`, silent timeouts, and a leaked `AGENT_SECRET`. With typed tools the
model picks from a labeled list, parameters are schema-validated before any HTTP,
and the secret lives in this process's env where the model can never see it.

## Tools

| Tool | Wraps | Notes |
|---|---|---|
| `execute_transaction` | `POST /execute` | irreversible; 150s budget; on timeout auto-polls the real outcome, never resubmits |
| `reject_transaction` | `PATCH /transactions/{id\|latest}` | structurally cannot touch `/execute` |
| `review_transaction` | `PATCH /transactions/{id\|latest}` | |
| `check_transaction_status` | `GET /transactions/:id` | status, txHash, risk verdict/reasons |
| `queue_request` | `POST /requests` | invoice or transfer instruction; address/amount validated |
| `list_requests` | `GET /requests?callerId=` | per-user scope |
| `update_request_status` | `PATCH /requests` | bookkeeping only |
| `update_screening_settings` | `PATCH /status` | screening toggle + limits/thresholds |

## Build

```bash
pnpm install
pnpm --filter zhentan-mcp build   # -> mcp/dist/index.js
```

## Environment

| Var | Required | Meaning |
|---|---|---|
| `AGENT_SECRET` | yes | Bearer token for the Zhentan server (never enters the model) |
| `ZHENTAN_API_URL` | no | Server base URL; defaults to `https://api.zhentan.me` |
| `MCP_TRANSPORT` | no | `stdio` (default). Streamable HTTP is a planned follow-up — see the tracking issue |

## nanobot configuration

Add to `~/.nanobot/config.json` under `tools`:

```json
"tools": {
  "mcpServers": {
    "zhentan": {
      "command": "node",
      "args": ["/absolute/path/to/zhentan/mcp/dist/index.js"],
      "env": {
        "ZHENTAN_API_URL": "http://localhost:3001",
        "AGENT_SECRET": "<your agent secret>"
      },
      "toolTimeout": 200
    }
  }
}
```

- **`toolTimeout: 200` is required** — nanobot's default 30s would cancel
  `execute_transaction` while it waits for on-chain inclusion.
- Restart the gateway after editing. Tools appear as `mcp_zhentan_<tool>`.
- Optional: `"enabledTools": [...]` to allow-list a subset.

Claude Desktop / Cursor use the same `command`/`args`/`env` shape under their
`mcpServers` key.

## Smoke test

```bash
# handshake + tool list (no server needed)
printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
 | AGENT_SECRET=dummy node dist/index.js

# end-to-end against a local server (expects clean "not found")
# ... id=3 tools/call check_transaction_status {"txId":"tx-deadbeef"}
```

## Design notes

- `src/server.ts` (`buildServer()`) is **transport-agnostic**: tools register once;
  `src/index.ts` attaches the transport. Adding streamable HTTP later means a new
  branch in `index.ts` plus auth middleware — zero tool changes.
- Tool handlers own failure semantics: API errors come back as readable `isError`
  results, and the execute-timeout recovery (poll status, never resubmit) is code,
  not prompt guidance.
