# On-chain verification matrix (B3 / D5)

Dust-transaction runbook for the sign/send separation gates. Run the full
matrix on **BSC mainnet** before merging B1/B2 (issue #87), and again with
the runtime in its own process at D5 (issue #99). Record every tx hash in
the gate issue.

## Prerequisites

- Funded test Safes, one per profile:
  - **protected** — `[embedded, backup, agent]` t=2 (v2 derivation)
  - **starter** — `[embedded]` t=1 (v2 derivation)
  - **guarded (legacy v1)** — `[embedded, agent]` t=2, `derivation_version = 1`,
    no backup key (needed for the blind co-sign row)
- Each Safe holds dust USDT/USDC (a few cents) for transfers and a token
  pair for one swap.
- Agent/sponsor EOA holds BNB above `AGENT_MIN_BNB` (default 0.05).
- Server running against production-equivalent env (`SAFE_API_KEY` set so
  the Transaction Service mirror is exercised).
- A second dust recipient address you control.

## Matrix

Execute in order; each row lists the trigger and what to verify beyond
"it executed": the Safe Transaction Service state and BscScan.

| # | Flow | Profile | Trigger | Verify |
|---|------|---------|---------|--------|
| 1 | Auto-approve → execute | protected | Propose a small transfer to a KNOWN recipient (low risk score) from the app | `autoExecuted: true` in the propose response; tx success on BscScan; `executedBy` = sponsor EOA = `from` on BscScan; service shows 2/2 executed |
| 2 | REVIEW → approve | protected | Transfer sized to land in the 40–70 band (or to a fresh recipient); approve via Telegram `approve tx-…` or dashboard | TG notification updates via `resolve_notification`; executes; nonce consumed |
| 3 | Agent reject (cancel at same nonce) | any | Propose, then reject via Telegram/dashboard | Empty self-call executes AT THE SAME NONCE (BscScan: 0 value self-tx); original shows rejected; next proposal takes the following nonce |
| 4 | Screening-off relay-only | protected | Disable screening; propose; co-sign with backup key; execute | Executes with TWO user signatures, agent contributes none (service shows both user confirmations, no agent confirmation); sponsor still pays gas |
| 5 | starter→protected transition | starter | "Add backup key" flow (atomic MultiSend batch) | Executes; `classifyProfile` now protected; `safe:verify-derivations` still green for the account |
| 6 | Auto-approve on legacy v1 | guarded (v1) | Small transfer from the v1 account | Same as row 1; proves encoding against the v1 initializer/fallback-handler deployment |
| 7 | Screening-off blind co-sign | guarded (v1) | Disable screening on the v1 account (allowed — capability exemption); propose; execute | Agent DOES co-sign despite screening off (`legacyExempt` path); executes at 2/2 |
| 8 | Draft smoke | any | Telegram: "pay 0.05 USDC to <addr>" → approve in dashboard → finalize → sign → execute | 1/2 mirror visible in app.safe.global after finalize; executes after user signature |

D5 re-run adds the full draft-flow matrix from issue #99 (swap quote
refresh, runtime-down cases, duplicate finalization, etc.).

## Recording template

Paste into the gate issue per row:

```
Row N — <flow>
Safe: 0x…  (profile, derivation vN)
Proposal tx id: tx-…
safeTxHash: 0x…
Execution hash: 0x…  (BscScan link)
executedBy: 0x…
Service state: …/… confirmed, executed=true
Notes: …
```

## Abort criteria

Stop and do not merge if any row shows: `GS026` (signature order),
`GS013` (failed inner call — for swaps, usually a stale quote, retry with
fresh finalize before concluding), a mismatch between `executedBy` and the
BscScan `from`, or a nonce consumed by anything other than the intended
transaction.

---

## D5 addendum — two-process verification (issue #99)

Run AFTER the D4 env migration, with BOTH processes up:

```
server/.env:   AGENT_ADDRESS set, SPONSOR_PRIVATE_KEY set, NO AGENT_PRIVATE_KEY
runtime/.env:  AGENT_PRIVATE_KEY set, RUNTIME_API_TOKEN matching the server
pnpm dev:server   +   pnpm dev:runtime     (or pm2 start both ecosystem files)
```

Sanity before starting: `curl 127.0.0.1:3002/health` → polling, no lastError.

### D5.A — B3 matrix re-run

Re-execute rows 1–8 above unchanged. Everything must behave identically —
with two additions to each row's Verify column:

- The screen job AND (where the agent signs) the sign job for the tx show
  `status='succeeded'` in `runtime_jobs`.
- The propose response still carries `autoExecuted`/`txHash` synchronously
  (the co-located runtime answers within the 20s window).

### D5.B — runtime-role rows

| # | Flow | Trigger | Verify |
|---|------|---------|--------|
| B1 | Runtime down: screened proposal | Stop the runtime; propose low-risk transfer | Response `screening: "pending"`; tx stays pending; NOTHING executes; job `pending` |
| B2 | Runtime recovery | Start the runtime | Backlog drains: decision applies, notifications fire, APPROVE auto-executes; total wait ≈ downtime |
| B3 | Runtime down: relay-only | Stop the runtime; starter-profile transfer (screening off) | Executes normally — no runtime involvement |
| B4 | Runtime down: rejection | Stop the runtime; reject a pending tx | Rejection stays `requested`/retryable; on runtime start the cancel signs + lands (B4 machinery + sign job) |
| B5 | Sign refusal visibility | Delete `runtime/data/decisions.jsonl`, then approve a REVIEW tx screened BEFORE the deletion | Runtime refuses (`no local screening record`); reconciler re-screens; second approve succeeds |
| B6 | signedBy verification | (Code-level, already unit-tested) | — |

### D5.C — draft-flow matrix (agent-created drafts)

| # | Flow | Trigger | Verify |
|---|------|---------|--------|
| C1 | Agent-created transfer draft | Queue a transfer request via TG/agent below the review band | Draft appears in dashboard; NO nonce consumed; no safeTxHash yet |
| C2 | User signs the draft | Sign it from the dashboard | finalizeDraft: nonce assigned, hash computed, sign job (`draft_finalization`) succeeds, service shows 1/2 with agent as sender |
| C3 | Review-band swap draft | Queue a swap request scoring 40–70 | Draft held for review; finalization only after approval |
| C4 | Swap-quote refresh at finalization | Let a swap draft sit past quote validity, then sign | Fresh route/min-out signed (never the stale quote); or SwapRefreshError surfaces cleanly |
| C5 | Runtime down during finalization | Stop runtime; sign a draft | Finalization fails cleanly (mirror is best-effort — flow continues OR surfaces retryably; record actual behaviour) |
| C6 | Duplicate finalization | Sign the same draft twice (double-click / two tabs) | Idempotent — one nonce, one mirror |
| C7 | User dismissal before nonce | Dismiss a draft | No nonce parked; row closed |
| C8 | Service down during mirror | (If feasible: invalid SAFE_API_KEY temporarily) finalize a draft | Flow continues locally; mirror error logged only |

### D5.D — no-agent-signature flows produce NO runtime jobs

After running: relay-only execute (B3 row 3), backup co-sign (row 4),
a Safe deploy (fresh onboarding), and a safeSync reconciliation (execute
from app.safe.global directly), assert:

```sql
select kind, purpose, count(*) from runtime_jobs
where tx_id in ('<relay-tx>', '<cosign-tx>')
group by 1, 2;                       -- expect: screen rows only, NO sign rows

select count(*) from runtime_jobs
where safe_address = '<deployed-safe>';   -- expect 0 (deploy makes no jobs)
```

(safeSync-reconciled txs must likewise show no sign jobs.)

### Recording

As with B3: record every row here with tx hashes / job ids and paste the
table into issue #99. Abort criteria unchanged (GS026, GS013, executedBy
mismatch) plus: any sign job that succeeds WITHOUT a matching decision
record (check `runtime/data/decisions.jsonl`) is an immediate stop.
