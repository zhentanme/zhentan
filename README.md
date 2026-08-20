# Zhentan 🕵️

Your personalized onchain detective agent and assistant that learns and guards your onchain behavior BNB Chain.

**[zhentan.me](https://zhentan.me)** · **[docs.zhentan.me](https://docs.zhentan.me)** · **[@zhentanme](https://x.com/zhentanme)**

## Requirements

- Node.js 18+
- pnpm 10+
- Supabase CLI (server database)
- NanoBot/Hermes CLI (optional — only for the conversational agent)

## Setup

```bash
pnpm install
```

**Client** (`client/.env.local`):

```env
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_AGENT_ADDRESS=
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
```

**Server** (`server/.env`):

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
AGENT_SECRET=            # or DEV_OPEN=1 for local work without an agent
AGENT_ADDRESS=           # identity only — the key lives in runtime/.env
SPONSOR_PRIVATE_KEY=     # gas-paying EOA
SAFE_API_KEY=
RUNTIME_API_TOKEN=       # must match runtime/.env
TELEGRAM_BOT_TOKEN=
ZERION_API_KEY=
PORT=3001
```

**Runtime** (`runtime/.env`):

```env
RUNTIME_API_URL=http://localhost:3001
RUNTIME_API_TOKEN=       # must match server/.env
AGENT_PRIVATE_KEY=       # the ONLY place the agent key lives
RUNTIME_RPC_URL=https://1rpc.io/bnb
```

See `server/.env.example`, `runtime/.env.example`, and `mcp/.env.example` for full annotated templates. Apply the DB schema with `cd server && pnpm db:link && pnpm db:push`.

## Development

```bash
pnpm dev:client      # http://localhost:3000
pnpm dev:server      # http://localhost:3001
pnpm dev:runtime     # agent runtime worker — health on 127.0.0.1:3002
pnpm dev:docs        # docs preview (pass a port if the runtime holds 3002)
```

## Structure

```
client/     Next.js 14 app
server/     Express API (Supabase-backed)
runtime/    Agent runtime — pull-only worker (leases jobs via the backend Runtime API; no DB access)
screening/  Pure screening core + job wire protocol, shared by server and runtime
agent/      NanoBot/Hermes skill pack (markdown playbook — no code, no keys)
mcp/        Zhentan MCP server — the bridge between the agent skill and the API
docs/       Mintlify docs
```

## Agent

```bash
mkdir -p ~/.nanobot/workspace/skills
ln -sf "$(pwd)/agent" ~/.nanobot/workspace/skills/zhentan
nanobot gateway restart
```
