# The agent domain

Everything the agent domain owns on the backend, behind one explicit interface
(`index.ts`). This surface was, verbatim, the job-payload surface of the
process split: the runtime (`runtime/`) shipped at D1–D4, and these functions
became job kinds and context payloads without their shape changing. What
remains here is the backend's side of that contract — pure evaluation shapes,
policy/persistence access, and deep analysis.

## Tiers

| Tier | Files | Contract |
|---|---|---|
| 1 — Pure evaluation | `evaluate.ts` | No I/O; loads with zero environment (re-export from `zhentan-screening`). `evaluateTransaction` (real decoded calldata) / `evaluateRequest` (synthetic shape). The evaluation timestamp is an **explicit input** — identical payloads replay identically. This purity is what keeps D3 authoritative screen jobs deterministic across processes. |
| 2 — Explicit persistence | re-exports of `lib/supabase/agentData.ts` | Policy reads (`loadPolicySnapshot`, rules, settings, limits) and learning writes (`recordOutcome`, `learnFromExecution`, `noteReviewOutcome`) — side effects named as side effects. |
| 2 — Deep analysis | `analysis.ts` | `deepAnalyze(tx)` — external scanners (GoPlus, Honeypot.is), flag aggregation. I/O by nature. |
| Signing | **moved to the runtime (D4)** | The backend holds no threshold-bearing key. Signatures come from verified sign jobs (`lib/runtime/signing.ts`) and are checked against `AGENT_ADDRESS`. |
| 3 — absent | — | Notifications and execution are the **caller's** job. Nothing here imports notify/telegram/execution machinery. |

## Enforcement (`scripts/lint-layering.sh`, wired into `pnpm lint`)

1. (A1) `lib/` never imports from `routes/`
2. (A2/D4) NO raw digest signing anywhere in the backend — the signer module moved to the runtime
3. (C2/D4) the retired signer module must not come back
4. (C2) `lib/supabase/agentData` importable only by `src/agent/`
5. (C2/D1) the risk engine + evaluation live in `zhentan-screening`; direct imports stay confined to the agent domain, shared shapes to their designated re-export sites
6. (D3) screening decisions come from the runtime via the job protocol — inline evaluation must never return to the HTTP surface

`lib/supabase/agentData.ts` is deliberately **not** re-exported from
`lib/supabase/index.ts` — the module path is the greppable choke point that
makes the boundary enforceable. At E3 those tables move behind policy
snapshots / evidence push; `agentData.ts` is the seam they move along.
