# Zhentan 🕵️

Your personalized onchain detective agent and assistant that learns and guards your onchain behavior BNB Chain.

**[zhentan.me](https://zhentan.me)** · **[docs.zhentan.me](https://docs.zhentan.me)** · **[@zhentanme](https://x.com/zhentanme)**

## Requirements

- Node.js 18+
- pnpm 10+
- OpenClaw CLI

## Setup

```bash
pnpm install
```

**Client** (`client/.env.local`):

```env
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_PIMLICO_API_KEY=
NEXT_PUBLIC_AGENT_ADDRESS=
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
```

**Server** (`server/.env`):

```env
AGENT_PRIVATE_KEY=
PIMLICO_API_KEY=
TELEGRAM_BOT_TOKEN=
ZERION_API_KEY=
PORT=3001
QUEUE_PATH=./pending-queue.json
INVOICE_QUEUE_PATH=./invoice-queue.json
```

See `scripts/.env.example` and `server/.env.example` for full templates.

## Development

```bash
pnpm dev:client      # http://localhost:3000
pnpm dev:server      # http://localhost:3001
pnpm dev:docs        # http://localhost:3002
```

## Structure

```
client/    Next.js 14 app
server/    Express API
agent/     OpenClaw skill pack
scripts/   CLI tools
docs/      Mintlify docs
```

## Agent

```bash
mkdir -p ~/.openclaw/workspace/skills
ln -sf "$(pwd)/agent" ~/.openclaw/workspace/skills/zhentan
openclaw gateway restart
```
