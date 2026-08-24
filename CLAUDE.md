# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Zhentan

Zhentan is a personalized wallet assistant with AI-powered transaction screening on BNB Chain, built on Safe multisigs with **wallet profiles** (`server/src/lib/safe/profiles.ts`, client mirror in `client/src/lib/safe/profiles.ts`):

- **starter** `[embedded]` t=1 — instant onboarding, no agent, screening unavailable; user's signature alone executes (agent relays gas without signing).
- **guarded** `[embedded, agent]` t=2 — screening structurally mandatory (user can't reach threshold alone); lockout risk disclosed at creation; persistent nudge to add a backup key. Legacy pre-refactor 2-of-2 accounts classify here.
- **protected** `[embedded, backup, agent]` t=2 — the full model: agent screens by default, but the user's two keys meet the threshold, so the agent is an advisory speed-bump — the user can always execute from app.safe.global with their backup key.
- **detached** `[embedded, backup]` t=2 — exit state only ("Detach Zhentan" in settings removes the agent; same address, stock Safe).

Profiles are COMPUTED from (owners, threshold, agent membership) via `classifyProfile` — never stored. Transitions are hard-validated owner-management SafeTxs on the same address (`validateTransitionTx` in queue.ts; client `lib/safe/transitions.ts`): starter→guarded, starter→protected (atomic MultiSend batch — never passes through unmanaged states), guarded→protected (`addOwnerWithThreshold`), protected→detached. Invariants: the agent NEVER reaches threshold alone (hard rule); the user's keys meet the threshold in every state except guarded (waived knowingly, always restorable).

**The agent never signs what it didn't screen**: when user signatures alone meet the threshold (starter, or screening-off in protected via a backup-key co-signature), `/execute` runs relay-only — the agent submits and pays gas but contributes no signature. Screening cannot be disabled in guarded (arithmetically impossible) and is enforced server-side in `validateSafeTxProposal`.

## Architecture

The workspace packages:

- **`client/`** — Next.js 14 frontend. Privy authentication (Google OAuth + embedded wallets + linked backup wallet), Safe smart account creation, transaction proposal (owner signs 1 of the 2 required signatures). Has its own API routes for local dev; in production calls the Express server.
- **`server/`** — Express API for queue management and execution. Required when client deploys to read-only filesystems (Vercel). Routes: `/queue`, `/execute`, `/transactions`, `/requests` (`/invoices` legacy alias), `/runtime`, `/health`, and more. State lives in Supabase (Postgres); the schema is the migration history (`server/supabase/`).
- **`runtime/`** — the agent runtime (D1): a pull-only worker, not a server. Long-polls the backend **Runtime API** (`/runtime/lease` → evaluate → `/runtime/jobs/:id/result`, heartbeats in between; dedicated bearer token `RUNTIME_API_TOKEN`, fail-closed). It has **no database credential ever** (lint-enforced + boot test); its only workspace dependency is `zhentan-screening`; the only socket it opens is a localhost health listener (`HEALTH_PORT`, default 3002). Screening inputs travel in the job payload.
- **`screening/`** — pure screening core shared verbatim by server and runtime: risk engine, `evaluateTransaction`/`evaluateRequest`, app transaction types, decoded-calldata shapes, and the runtime-job wire protocol (schema version + canonical input hash). Dependency-free and env-free by construction (lint-enforced) — this is what keeps D3 authoritative screen jobs deterministic and replayable across processes. Server files re-export from it (`src/types.ts`, `safe/kind.ts`, `agent/evaluate.ts`, `runtime/jobsPolicy.ts`), so server-internal imports are unchanged.
- **`agent/`** — NanoBot/Hermes skill pack (`zhentan-agent`): a pure markdown playbook (`SKILL.md`) with no code or keys. The agent's role is conversational — it acts on owner commands (review pending, approve/reject, rules, requests) exclusively through the **`mcp/`** package's MCP tools, never raw HTTP. Risk scoring itself runs in the runtime: APPROVE (risk < 40), REVIEW (40-70), or BLOCK (> 70).
- **`mcp/`** — the Zhentan MCP server (`zhentan-mcp`): the only bridge between the agent skill and the backend API (bearer `AGENT_SECRET`; `ZHENTAN_API_URL` required, no production fallback).

Transaction flow (SafeTx-only for users): User signs a standard SafeTx (EIP-712) → queued + mirrored to the Safe Transaction Service (visible in app.safe.global at 1/2) → **screening runs in the runtime** (D3: the propose handler enqueues a `screen` job and observes the transaction row with a bounded timeout, `SCREENING_TIMEOUT_MS` default 20s; the Runtime API result endpoint applies the decision exactly once via `lib/screening/apply.ts` — writes, notifications, auto-execute; timeout degrades the response to `screening: "pending"` and the decision applies when it lands; no runtime → fail-closed, screened proposals stay queued while relay-only and backup co-sign flows are unaffected) → **the agent signature comes from the runtime via a verified `sign` job** (D4: the runtime's signing authority recomputes the EIP-712 hash, reads owners/threshold/nonce from chain, requires its OWN decision record — or version-pinned user-approval evidence for REVIEW/BLOCK and draft finalization — and re-derives the legacy v1 capability before its key signs anything; the backend verifies `signedBy` + the recovered signer against `AGENT_ADDRESS` and reuses the ONE signature for both the service confirmation and on-chain assembly) → sponsor EOA relays `execTransaction` and pays BNB gas. Rejections execute a pre-signed empty tx at the same nonce to avoid nonce holes (one runtime-signed agent signature serves both the service mirror and the cancel). A `safeSync` worker reconciles txs executed directly from the Safe UI (the user-override path). The legacy 2-of-2 upgrade (`addOwnerWithThreshold`) is also a plain SafeTx. ERC-4337/Pimlico survives ONLY for treasury payouts; the legacy user-tx 4337 execution path was RETIRED at D4 (all pending pre-refactor rows audited + superseded; `executeLegacy4337` refuses).

**Telegram linking is chat-initiated and server-enforced** (#134): the auth middleware answers every tool call from a valid-but-unbound `telegram:<id>` principal with an `auth_required` envelope (RFC 8628 device-grant shape — idempotent ≥128-bit code, ~15 min TTL, `app.zhentan.me/link?code=…`); the Privy-authed `/link` page shows the Telegram identity and completes the binding; malformed identities stay 403 and never mint codes. The binding lives in `telegram_links` (`telegram_user_id` UNIQUE = strictly one account per Telegram; `telegram_chat_id` stored separately for delivery; private chats only) — the legacy `user_details.telegram_id` / `user_settings.telegram_chat_id` / `bot_connected` columns are retired (unread, dropped in a follow-up migration). Relink is a consented atomic re-point (`complete_telegram_link` RPC; the losing account gets screening set to manual + notified); unlink is one server transaction (`unlink_telegram` RPC) that also retires the chat's live approve/reject messages. Per-user Telegram notifications NEVER fall back to the admin chat (`TELEGRAM_CHAT_ID` is operational-alerts-only, e.g. `notifyAdminTelegram` gas watchdog); an unresolved user chat drops silently while email still fires. The Privy Telegram connector is gone from the client — the link signal is `GET /status`.`telegramLinked` / `GET /telegram`.

**Address derivation is server-side only, versioned, and registry-based** (`server/src/lib/safe/derive.ts` DERIVATIONS registry; per-user `user_details.derivation_version`, default for new users via `SAFE_DERIVATION_VERSION`): v1 = legacy permissionless initializer (Safe4337Module enabled) for all pre-refactor accounts; v2 = vanilla stock Safe (protocol-kit initializer, CompatibilityFallbackHandler, no modules). Adding a v3 = one registry entry + config bump; existing accounts stay pinned to their stored version. The client gets addresses from `GET /users/by-signer` (existing users) or `POST /safe/derive` (new users, with their chosen profile) — it never derives locally. **Derivation runs once at account creation**; the immutable birth certificate (`creation_owners`/`creation_threshold`/`creation_salt_nonce` + `derivation_version`, frozen by DB trigger) keeps every address re-derivable forever even after transitions rewrite the live owner set (`safe_owners` mirrors chain). Audit scripts: `pnpm --filter zhentan-server safe:verify-derivations` (re-derive all snapshots) and `safe:backfill-snapshots` (verification-driven backfill).

Safes are deployed eagerly at onboarding (agent pays; the Transaction Service only indexes deployed Safes). Owner order for address derivation is canonical `[embedded, backup, agent]` — positional, never sorted; deployed Safes read owners from chain/DB (after `addOwnerWithThreshold` the on-chain order differs).

**Durable job protocol (D0.2, `server/src/lib/runtime/`)**: the pull model the agent runtime (`runtime/`) consumes over the Runtime API. `runtime_jobs` (kind `screen`|`sign` with a required `purpose` discriminator on sign jobs — execution | rejection | draft_finalization; leases with token/expiry/heartbeat; attempts cap into dead-letter; idempotent verifiable results carrying input hash + policy/credential/schema versions). Screening decisions bind to a per-transaction `version` bumped ONLY by domain events — payload/hash change, nonce assignment, user signatures, approval/rejection lifecycle, screening change, owner/threshold change, supersession — enforced by the `bump_transaction_version` DB trigger; metadata-only writes never bump. Decision-invalidating policy edits (user rules, limits, screening mode — not learned-pattern updates) propagate into pending transactions' versions via triggers, riding the same invalidation mechanism. Result acceptance is atomic (`submit_runtime_job_result` RPC locks job + transaction rows), so a mid-flight domain event can never land a stale result. Pure rules in `jobsPolicy.ts` (contract-tested), I/O in `jobs.ts`. The txId→Telegram-messageId map lives in `notification_messages` (survives restarts/process splits). Screen jobs are AUTHORITATIVE since D3 (shadow comparison served its gate at D2 — divergence 0 — and was retired): every screened proposal's verdict comes from the runtime through the job protocol; inline evaluation is gone from routes (layering rule 6). The runtime keeps its own append-only decision store (`runtime/data/decisions.jsonl`) — the only file-based state in the system; everything server-side (transactions, requests, patterns, rules, screening mode) lives in Supabase.

## Development Commands

This is a pnpm workspace. Run `pnpm install` from the root to install all packages.

### From root
```bash
pnpm dev:client      # http://localhost:3000
pnpm dev:server      # http://localhost:3001
pnpm dev:runtime     # pull-only worker; health on 127.0.0.1:3002
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

### Agent skill pack
The `agent/` package has no runnable scripts — it is a markdown skill (`SKILL.md`) driven through the `mcp/` server. Symlink it into NanoBot/Hermes with `ln -sf "$(pwd)/agent" ~/.nanobot/workspace/skills/zhentan`.

## Tech Stack

- **Chain**: BNB Chain (BSC), Chain ID 56, RPC `https://1rpc.io/bnb`
- **Smart Account**: Safe 1.4.1 multisig (stock, v2 derivation); ERC-4337 (EntryPoint v0.7) survives only on legacy v1 accounts and treasury payouts
- **Bundler/Paymaster**: Pimlico — treasury payouts only (user txs are sponsor-relayed SafeTx)
- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS, Framer Motion
- **Auth**: Privy (embedded wallets + Google OAuth)
- **Blockchain libs**: viem, permissionless.js (treasury)
- **Backend**: Express, Supabase (Postgres), tsx (dev), PM2 (production)
- **AI Agent**: NanoBot/Hermes with Qwen3-235B / Claude Sonnet 4.5 via OpenRouter

## Key Configuration

### Client path alias
`@/*` maps to `./src/*` in client TypeScript config.

### Environment variables
- **Client**: `NEXT_PUBLIC_AGENT_ADDRESS`, `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_BACKEND_URL` (optional, for remote server)
- **Server**: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (database), `AGENT_SECRET` (agent auth — boot-blocking; `DEV_OPEN=1` local escape hatch), `PRIVY_APP_ID` + `PRIVY_JWT_VERIFICATION_KEY` (client auth), `AGENT_ADDRESS` (agent identity — the KEY lives in the runtime since D4; a dev-only fallback derives it from `AGENT_PRIVATE_KEY` outside production, with a warning), `SPONSOR_PRIVATE_KEY` (gas-paying/sending EOA — required in production since D4), `PIMLICO_API_KEY` (treasury payouts only), `SAFE_API_KEY` (Safe Transaction Service, from developer.safe.global), `SAFE_TX_SERVICE_URL` (optional override), `SAFE_DERIVATION_VERSION` (new-account derivation, default 2), `AGENT_MIN_BNB` (relayer gas alert threshold, default 0.05), `PORT` (default 3001), `RUNTIME_API_TOKEN` (enables the Runtime API; unset = every `/runtime` endpoint answers 503)
- **Runtime**: `RUNTIME_API_URL`, `RUNTIME_API_TOKEN`, `AGENT_INSTANCE_ID` (default `shared-agent`), `POLL_INTERVAL_MS`, `HEALTH_PORT`, **`AGENT_PRIVATE_KEY` (D4 — the ONLY threshold-bearing key in the system lives here)**, `RUNTIME_RPC_URL` (chain reads for sign verification) — see `runtime/.env.example`; NO database credentials belong here
- **MCP**: `ZHENTAN_API_URL` (required, no production fallback), `AGENT_SECRET`, `MCP_TRANSPORT` — see `mcp/.env.example`

See `server/.env.example`, `runtime/.env.example`, and `mcp/.env.example` for templates.

### Safe contract addresses (BSC)
- Singleton: `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`
- Proxy Factory: `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`

### Next.js config
- Transpiles `@privy-io/react-auth`
- Custom webpack alias shims `lucide-react` for SSR compatibility (`client/lucide-react-shim.mjs`)

## Known Issues

- **USDC decimals discrepancy**: RESOLVED — `USDC_DECIMALS` removed from `client/src/lib/constants.ts`; `proposeTransaction` now requires `tokenDecimals: number` and fails loudly if missing. Token decimals come from on-chain/portfolio metadata.
- **Single sender process**: concurrent execution of one transaction is guarded by a DB lease (`execution_lease_*` columns, atomic conditional claim — safe across processes). But sponsor sends (execution, rejection, deploy) must still run in exactly ONE process: the sponsor EOA's nonces are serialized by viem's in-process `nonceManager`. Keep PM2 `instances: 1` until a DB-backed per-sponsor submission queue exists.
- **Live demo** at zhentan.me runs without the NanoBot/Hermes agent (no screening). Full AI screening requires local setup with agent.
