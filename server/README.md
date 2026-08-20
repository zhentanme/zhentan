# Zhentan Server

Express API for the transaction lifecycle: SafeTx proposal (`/queue`), screening orchestration, execution relaying (`/execute`), payment requests, portfolio data, and the Runtime API the agent runtime pulls jobs from. State lives in Supabase (Postgres) — see [supabase/README.md](./supabase/README.md); the schema **is** the migration history.

Screening decisions come from the runtime (`runtime/`) via the durable job protocol — the server enqueues `screen`/`sign` jobs and applies verified results. It holds **no threshold-bearing key**: since D4 the agent key lives only in `runtime/.env`, and the server verifies runtime signatures against `AGENT_ADDRESS`.

## Setup

This is a pnpm workspace — install from the repo root:

```bash
pnpm install
cd server
cp .env.example .env
```

Required env (see `.env.example` for the full annotated list):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — database
- `AGENT_SECRET` — agent → server auth; the server refuses to boot without it (`DEV_OPEN=1` for local work without an agent)
- `AGENT_ADDRESS` — agent owner EOA (identity only; the key is in `runtime/.env`)
- `SPONSOR_PRIVATE_KEY` — gas-paying EOA (deploys, relaying, rejections)
- `SAFE_API_KEY` — Safe Transaction Service mirroring
- `RUNTIME_API_TOKEN` — enables the `/runtime` endpoints (unset = 503, fail closed); must match `runtime/.env`
- `PRIVY_APP_ID`, `PRIVY_JWT_VERIFICATION_KEY` — client identity tokens

Apply the schema with the Supabase CLI:

```bash
pnpm db:link   # once
pnpm db:push
```

## Run

```bash
pnpm dev            # development (tsx watch), http://localhost:3001
pnpm build && pnpm start
pnpm pm2:start      # production under PM2 (keep instances: 1 — sponsor
                    # nonces are serialized in-process)
```

For screening to work, the runtime worker must also be running: `pnpm dev:runtime` from the repo root.

## Checks

```bash
pnpm test                     # vitest
pnpm lint                     # tsc + layering rules (scripts/lint-layering.sh)
pnpm safe:verify-derivations  # re-derive all creation snapshots
```
