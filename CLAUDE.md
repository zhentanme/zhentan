# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Zhentan

Zhentan is a personalized wallet assistant with AI-powered transaction screening. It uses a Safe multisig (2-of-2) on BNB Chain where the user is one signer and an OpenClaw AI agent is the other. The agent analyzes transactions against learned behavioral patterns and either auto-approves, sends for review (via Telegram/WhatsApp), or blocks suspicious activity.

## Architecture

Three components work together:

- **`client/`** — Next.js 14 frontend. Privy authentication (Google OAuth + embedded wallets), Safe smart account creation, transaction proposal (owner signs 1 of 2). Has its own API routes for local dev; in production calls the Express server.
- **`server/`** — Express API for queue management and execution. Required when client deploys to read-only filesystems (Vercel). Routes: `/queue`, `/execute`, `/transactions`, `/invoices`, `/health`. Reads/writes JSON queue files.
- **`agent/`** — OpenClaw skill pack (`zhentan-agent`). Agent runs on a cron (every 10s), picks up pending transactions, scores risk, and decides: APPROVE (risk < 40), REVIEW (40-70), or BLOCK (> 70). Skills: `check-pending`, `analyze-risk`, `sign-and-execute`, `mark-review`, `reject-tx`, `record-pattern`, `toggle-screening`, `queue-invoice`, `get-status`.

Transaction flow: User signs in client → queued to `pending-queue.json` → agent analyzes → agent co-signs (2 of 2) → submitted to Pimlico bundler → gasless execution on BNB Chain via ERC-4337.

State files (JSON): `pending-queue.json`, `invoice-queue.json`, `state.json` (screening mode/decisions), `patterns.json` (learned behavior).

## Development Commands

This is a pnpm workspace. Run `pnpm install` from the root to install all packages.

### From root
```bash
pnpm dev:client      # http://localhost:3000
pnpm dev:server      # http://localhost:3001
pnpm build           # build all packages
pnpm lint            # lint all packages
```

### Per package (from root)
```bash
pnpm --filter zhentan-client dev
pnpm --filter zhentan-server dev
pnpm --filter zhentan-server build
pnpm --filter zhentan-server pm2:start
```

### Agent skills
```bash
pnpm --filter zhentan-agent check-pending
pnpm --filter zhentan-agent analyze-risk
pnpm --filter zhentan-agent sign-and-execute
```

### Scripts (CLI tools)
```bash
pnpm propose         # propose-tx.js — owner proposes and signs
pnpm agent-sign      # agent-sign.js — agent co-signs and executes
```

## Tech Stack

- **Chain**: BNB Chain (BSC), Chain ID 56, RPC `https://1rpc.io/bnb`
- **Smart Account**: Safe 1.4.1 multisig with ERC-4337 (EntryPoint v0.7)
- **Bundler/Paymaster**: Pimlico (gasless via account abstraction)
- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS, Framer Motion
- **Auth**: Privy (embedded wallets + Google OAuth)
- **Blockchain libs**: viem, permissionless.js
- **Backend**: Express, tsx (dev), PM2 (production)
- **AI Agent**: OpenClaw with Qwen3-235B / Claude Sonnet 4.5 via OpenRouter

## Key Configuration

### Client path alias
`@/*` maps to `./src/*` in client TypeScript config.

### Environment variables
- **Client**: `NEXT_PUBLIC_PIMLICO_API_KEY`, `NEXT_PUBLIC_AGENT_ADDRESS`, `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_BACKEND_URL` (optional, for remote server)
- **Server**: `QUEUE_PATH`, `AGENT_PRIVATE_KEY`, `PIMLICO_API_KEY`, `PORT` (default 3001), `CORS_ORIGIN`
- **Scripts**: `PRIVATE_KEY`, `PIMLICO_API_KEY`, `RECIPIENT_ADDRESS`, `USDC_AMOUNT`, `USDC_CONTRACT_ADDRESS`, `OWNER_ADDRESS1`, `OWNER_ADDRESS2`, `SAFE_THRESHOLD`

See `scripts/.env.example` and `server/.env.example` for templates.

### Safe contract addresses (BSC)
- Singleton: `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`
- Proxy Factory: `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`

### Next.js config
- Transpiles `@privy-io/react-auth`
- Custom webpack alias shims `lucide-react` for SSR compatibility (`client/lucide-react-shim.mjs`)

## Known Issues

- **USDC decimals discrepancy**: `client/src/lib/constants.ts` declares `USDC_DECIMALS = 18`, but scripts use 6 decimals. BSC mainnet USDC uses 18 decimals; other chains may differ.
- **Queue file paths**: Scripts default to `~/.openclaw/workspace/skills/zhentan/pending-queue.json`. Override with `QUEUE_PATH` env var.
- **Live demo** at zhentan.me runs without the OpenClaw agent (no screening). Full AI screening requires local setup with agent.
