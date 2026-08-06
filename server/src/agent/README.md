# The agent domain

Everything the future Zhentan runtime owns, behind one explicit interface
(`index.ts`). **This surface is, verbatim, the job-payload surface of the
process split** — when the runtime moves out of process (D-milestone), these
functions become job kinds and context payloads; nothing about their shape
changes.

## Tiers

| Tier | Files | Contract |
|---|---|---|
| 1 — Pure evaluation | `evaluate.ts` | No I/O; loads with zero environment. `evaluateTransaction` (real decoded calldata) / `evaluateRequest` (synthetic shape). The evaluation timestamp is an **explicit input** — identical payloads replay identically. |
| 2 — Explicit persistence | re-exports of `lib/supabase/agentData.ts` | Policy reads (`loadPolicySnapshot`, rules, settings, limits) and learning writes (`recordOutcome`, `learnFromExecution`, `noteReviewOutcome`, `recordEvent`) — side effects named as side effects. |
| 2 — Deep analysis | `analysis.ts` | `deepAnalyze(tx)` — external scanners (GoPlus, Honeypot.is), flag aggregation. I/O by nature. |
| Signing | re-export of `lib/agent/signer.ts` | `getSigningAuthority()` — verified `SafeSigningRequest`s only; the raw `KeySigner` is module-private. |
| 3 — absent | — | Notifications and execution are the **caller's** job. Nothing here imports notify/telegram/execution machinery. |

## Enforcement (`scripts/lint-layering.sh`, wired into `pnpm lint`)

- `lib/` never imports from `routes/` (A1)
- `signHash(`/`signDigest(` only inside the signer module (A2)
- `lib/agent/signer` importable only by `src/agent/index.ts` (C2)
- `lib/supabase/agentData` importable only by `src/agent/` (C2)
- `risk.js` importable only by `src/agent/` (+ a type import in agentData) (C2)

`lib/supabase/agentData.ts` is deliberately **not** re-exported from
`lib/supabase/index.ts` — the module path is the greppable choke point that
makes the boundary enforceable. At E3 those tables move behind policy
snapshots / evidence push; `agentData.ts` is the seam they move along.
