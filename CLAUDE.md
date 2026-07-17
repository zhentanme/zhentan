# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Zhentan

Zhentan is a personalized wallet assistant with AI-powered transaction screening. It uses a Safe multisig (2-of-3) on BNB Chain: the user holds two keys (Privy embedded wallet + a linked backup wallet) and an NanoBot/Hermes AI agent holds the third; any 2 signatures execute. The agent analyzes transactions against learned behavioral patterns and either auto-approves, sends for review (via Telegram/WhatsApp), or blocks suspicious activity. Because the user's two keys meet the threshold alone, the agent is an advisory speed-bump, not a custodial gate — the user can always execute from app.safe.global without it. (Legacy accounts created as 2-of-2 remain supported until upgraded in-app via `addOwnerWithThreshold`.)

## Architecture

Three components work together:

- **`client/`** — Next.js 14 frontend. Privy authentication (Google OAuth + embedded wallets + linked backup wallet), Safe smart account creation, transaction proposal (owner signs 1 of the 2 required signatures). Has its own API routes for local dev; in production calls the Express server.
- **`server/`** — Express API for queue management and execution. Required when client deploys to read-only filesystems (Vercel). Routes: `/queue`, `/execute`, `/transactions`, `/invoices`, `/health`. Reads/writes JSON queue files.
- **`agent/`** — NanoBot/Hermes skill pack (`zhentan-agent`). Agent runs on a cron (every 10s), picks up pending transactions, scores risk, and decides: APPROVE (risk < 40), REVIEW (40-70), or BLOCK (> 70). Skills: `check-pending`, `analyze-risk`, `sign-and-execute`, `mark-review`, `reject-tx`, `record-pattern`, `toggle-screening`, `queue-invoice`, `get-status`.

Transaction flow (SafeTx-only for users): User signs a standard SafeTx (EIP-712) → queued + mirrored to the Safe Transaction Service (visible in app.safe.global at 1/2) → agent analyzes → agent confirms via the service and relays `execTransaction` (agent EOA pays BNB gas). Rejections execute a pre-signed empty tx at the same nonce to avoid nonce holes. A `safeSync` worker reconciles txs executed directly from the Safe UI (the user-override path). The legacy 2-of-2 upgrade (`addOwnerWithThreshold`) is also a plain SafeTx. ERC-4337/Pimlico survives ONLY for executing pre-refactor queued rows (`tx_type='4337'`) and treasury payouts — never for new user transactions.

**Address derivation is server-side only and versioned** (`server/src/lib/safe/derive.ts`, per-user `user_details.derivation_version`, default for new users via `SAFE_DERIVATION_VERSION`): v1 = legacy permissionless initializer (Safe4337Module enabled) for all pre-refactor accounts; v2 = vanilla stock Safe (protocol-kit initializer, CompatibilityFallbackHandler, no modules). The client gets addresses from `GET /users/by-signer` (existing users) or `POST /safe/derive` (new users) — it never derives locally. Stored addresses are cross-checked against re-derivation before deploys. v1 can be retired once no active users remain on it.

Safes are deployed eagerly at onboarding (agent pays; the Transaction Service only indexes deployed Safes). Owner order for address derivation is canonical `[embedded, backup, agent]` — positional, never sorted; deployed Safes read owners from chain/DB (after `addOwnerWithThreshold` the on-chain order differs).

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
- **AI Agent**: NanoBot/Hermes with Qwen3-235B / Claude Sonnet 4.5 via OpenRouter

## Key Configuration

### Client path alias
`@/*` maps to `./src/*` in client TypeScript config.

### Environment variables
- **Client**: `NEXT_PUBLIC_AGENT_ADDRESS`, `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_BACKEND_URL` (optional, for remote server)
- **Server**: `QUEUE_PATH`, `AGENT_PRIVATE_KEY`, `PIMLICO_API_KEY` (legacy 4337 rows + treasury only), `SAFE_API_KEY` (Safe Transaction Service, from developer.safe.global), `SAFE_TX_SERVICE_URL` (optional override), `SAFE_DERIVATION_VERSION` (new-account derivation, default 2), `AGENT_MIN_BNB` (relayer gas alert threshold, default 0.05), `PORT` (default 3001), `CORS_ORIGIN`
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
- **Queue file paths**: Scripts default to `~/.nanobot/workspace/skills/zhentan/pending-queue.json`. Override with `QUEUE_PATH` env var.
- **Live demo** at zhentan.me runs without the NanoBot/Hermes agent (no screening). Full AI screening requires local setup with agent.
