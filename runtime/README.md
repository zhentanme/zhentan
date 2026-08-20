# Zhentan Runtime

The agent runtime: a **pull-only worker**, not a server. It long-polls the
backend Runtime API (`/runtime/lease` → evaluate → `/runtime/jobs/:id/result`,
heartbeats in between) with a dedicated bearer token, and holds the **only
threshold-bearing key in the system** (`AGENT_PRIVATE_KEY`, since D4).

Hard boundaries (lint-enforced by `scripts/lint-boundary.sh` + a boot test):

- **No database credential, ever.** The runtime speaks only the Runtime API;
  screening inputs travel in the job payload.
- Its only workspace dependency is `zhentan-screening` (the pure core shared
  bit-for-bit with the server).
- The only socket it opens is a localhost health listener (`HEALTH_PORT`,
  default 3002).

## What it does

- **`screen` jobs** — runs the deterministic risk engine over the job payload
  and submits the verdict; screen jobs are authoritative (D3), and no runtime
  means screening fails closed.
- **`sign` jobs** — the signing authority recomputes the EIP-712 hash, reads
  owners/threshold/nonce from chain (`RUNTIME_RPC_URL`), requires its own
  decision record (or version-pinned user-approval evidence for REVIEW/BLOCK
  and draft finalization), and re-derives the legacy v1 capability before the
  key signs anything. The backend verifies the recovered signer against
  `AGENT_ADDRESS`.
- Keeps an append-only local decision store (`data/decisions.jsonl`,
  overridable via `DECISION_STORE_PATH`).

## Run

```bash
cp .env.example .env    # RUNTIME_API_URL, RUNTIME_API_TOKEN, AGENT_PRIVATE_KEY, RUNTIME_RPC_URL
pnpm dev                # or from the repo root: pnpm dev:runtime
```

`RUNTIME_API_TOKEN` must match the server's; the `/runtime` endpoints answer
503 until both sides have it.

## Checks

```bash
pnpm test    # vitest
pnpm lint    # tsc + boundary guard (no DB creds, dependency allowlist)
```
