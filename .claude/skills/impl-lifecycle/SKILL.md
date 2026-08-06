---
name: impl-lifecycle
description: Implementation lifecycle for the agent-service separation tasks (GitHub issues #81–#105, milestones A–F + Intent Proposer). Use when starting, implementing, reviewing, or shipping any separation task (A1…F2, IP) — covers PR granularity, branch naming, test-first rules, verification gates, docs checklists, and issue/plan bookkeeping.
---

# Agent-service separation — implementation lifecycle

## Ground rules

- **One PR per task issue, never per milestone.** Every task (#81–#105) was
  scoped to be independently shippable and revertable. Milestones (A–F, IP)
  are grouping only; a milestone is done when all its issues are merged and
  its gate issue (B3 #87, D5 #99) has recorded on-chain evidence.
- **Source of truth**: the GitHub issue is self-contained. The full plan
  lives locally at `.local/architecture/agent-service-separation-tasks.md`
  (uncommitted) — read the matching § before starting; if code reality
  contradicts the plan, update the plan doc and note it in the PR.
- **Dependency order is hard.** Only pick an issue whose "Depends on" issues
  are merged. Within a milestone, lowest task number first.
- **Behaviour-preserving phases (A*, C*) must be byte-identical**: no logic
  changes, no drive-by refactors, no comment rewrites outside the moved code.
  If you spot an unrelated bug, file an issue — don't fix it in the PR.

## Lifecycle per task

1. **Pick**: lowest open issue with all dependencies merged. Read the issue
   AND the plan § AND the files it names. Assign yourself / note in issue.
2. **Branch** from up-to-date `preview` (the integration branch — it equals
   `main` plus not-yet-promoted tasks):
   `refactor/<id>-<slug>` for A/C (code motion), `feat/<id>-<slug>` for
   D/E/F/IP, `fix/<id>-<slug>` for B4-style bug tasks, `test/<id>-<slug>`
   for harness tasks. Example: `refactor/a1-execution-out-of-routes`.
3. **Tests first** where the issue's "Tests (from the start)" section lists
   them — write them against current behaviour before changing it, so the
   change is provably behaviour-preserving. Pure-motion tasks lean on
   `pnpm build && pnpm lint` + the layering check instead.
4. **Implement** the smallest diff that satisfies "Done when".
5. **Verify** (all must pass before the PR):
   - `pnpm build && pnpm lint` (lint includes `lint:layering` once A1 lands)
   - `pnpm --filter zhentan-server test` (once B0 lands)
   - Task-specific gates: B1/B2 merge only with golden byte-diff green and
     the B3 matrix recorded in #87; D3 flips only on D2's ~zero divergence;
     D4 merges only with its refusal-matrix tests green.
6. **Docs in the same PR** — work through the issue's "Docs to update"
   checklist literally: `CLAUDE.md`, `server/.env.example`,
   `agent/SKILL.md` (symlinked into NanoBot — remind the operator to restart
   `hermes-gateway` after merge), client env examples, READMEs.
7. **Plan bookkeeping** (local, uncommitted but mandatory): mark the task
   complete in `.local/architecture/agent-service-separation-tasks.md`,
   record deviations/decisions discovered during implementation.
8. **PR — ALWAYS against `preview`, never `main` directly**:
   - Base `preview`, one PR per task. Title: `<ID>: <short description>`
     (e.g. `B0: golden payload harness`).
   - Body: `Implements #<issue>` — do NOT rely on `Closes #` keywords
     (they only fire on default-branch merges); the issue is closed
     manually at the preview merge (step 9).
   - What/why in two sentences, verification evidence (command output,
     tx hashes for on-chain gates), the docs checklist with boxes ticked.
   - **Manual UI test section** — mandatory whenever the diff can break a
     user-visible flow (see "Manual UI tests per change area" below):
     concrete click-through steps + the failure signature to watch for, as
     a checkbox list run on the preview deployment. Pure tooling/docs PRs
     state "No UI-testable surface" explicitly.
   - Branch from `preview` (it should equal `main` + unpromoted tasks).
     Keep the diff reviewable; past ~600 non-mechanical lines, split.
9. **Merge to `preview`** after review + checks; run the manual UI tests
   there. **Close the task issue now** (`gh issue close <n> --comment` with
   the PR link and one-line outcome) — merged-to-preview IS done; promotion
   is a release step, not part of the task. Tick the task in the plan doc's
   index. Then return to step 1.
10. **Promotion `preview` → `main`**: once the tested tasks' checklists
    pass, open a promotion PR whose body *references* the tasks it carries
    (issues are already closed at preview merge). Promote at least at
    every milestone gate (post-B3, post-D5); more often is fine.
    **Sync rule:** if `main` ever receives commits directly (hotfix),
    immediately open and merge a `main` → `preview` sync PR. Check drift
    with `git rev-list --left-right --count origin/preview...origin/main`
    before every new task branch.

## Invariants that no PR may violate

- `lib/` never imports from `routes/` (`lint:layering`).
- The agent never signs what it didn't screen; relay-only stays relay-only.
- `KeySigner` is private — nothing outside the signer module may accept or
  transport a bare hash for signing (from A2 onward).
- The runtime never holds a Supabase credential (from D1 onward).
- User commands and canonical transaction state enter through the backend
  only (from D-milestone onward).
- Signature assembly is owner-ascending (`GS026` reverts otherwise).

## Manual UI tests per change area

Every PR whose diff touches one of these areas MUST carry a "Manual UI
tests" checkbox section in its body, naming the flows below plus the
failure signature to watch for. Skip the section only for pure tooling/docs
diffs — and say so explicitly ("No UI-testable surface"). The tester runs
these on the preview deployment (PR to `preview` branch / Vercel preview
URL); automated tests do not replace this for consensus-critical or
state-machine changes.

| Diff touches | Manual UI flows to list |
|---|---|
| Signing (`lib/agent/signer.ts`, call sites) | Propose → auto-approve → execute; reject an in-review tx; agent-drafted request → approve → finalize (visible 1/2 in app.safe.global). Watch for: unexpected "Signing refused" |
| Execution / send path (`lib/execution/`, sponsor) | Auto-approve execute; REVIEW → approve via dashboard or Telegram; relay-only (screening off + backup co-sign); check `executedBy`/hash on BscScan |
| Rejection lifecycle (`reject.ts`, transactions state) | Reject from dashboard AND Telegram; verify nonce is consumed by the cancel on-chain; verify a failed cancel resurfaces as retryable, not silently "rejected" |
| Screening / risk (`agent/` module, queue) | Low-risk transfer auto-executes; high-amount transfer hits REVIEW with TG+email notification; BLOCK path; screening toggle on protected vs guarded |
| Requests / drafts (`requests.ts`, `finalizeDraft.ts`) | Queue invoice + transfer + swap via Telegram; approve from dashboard; swap quote refresh at finalize; dismiss a draft |
| Notifications (`notify.ts`, events) | REVIEW notification arrives in TG with buttons; approve/reject from TG updates the original message (`resolve_notification`); email variants |
| Profiles / transitions (`profiles.ts`, `queue.ts` validation, client `useSafeUpgrade`) | starter→protected and guarded→protected transitions end-to-end; "Detach Zhentan"; profile badge correct after transition |
| Onboarding / identity (derive, users routes, Privy) | Fresh Google login → Safe created → address matches on refresh; existing user re-login resolves same Safe |
| MCP / Telegram surface (`mcp/`, SKILL.md) | `/start` pairing; "check pending"; approve/reject/deep-analyze by tx id; rules CRUD via chat |
| Runtime split (D-milestone PRs) | All of the signing + screening rows above, cross-process, plus: runtime stopped → screening-mandatory queues, relay-only still executes |

When a PR spans several areas, merge the flow lists and dedupe. Put the
flows in the PR targeting `preview` as well, since that is where they get
executed.

## On-chain verification (B3 #87, D5 #99)

Dust transactions on BSC mainnet per the matrix in the gate issue. Record
every tx hash in the gate issue before the corresponding code PR merges.
Needed: funded test Safes for protected/starter/guarded(v1) profiles and
agent BNB for gas. Runbook lives in `scripts/test/` (created by B0).
