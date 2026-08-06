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
