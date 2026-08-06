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
2. **Branch** from up-to-date `main`:
   `refactor/<id>-<slug>` for A/C (code motion), `feat/<id>-<slug>` for
   D/E/F/IP, `fix/<id>-<slug>` for B4-style bug tasks.
   Example: `refactor/a1-execution-out-of-routes`.
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
8. **PR**:
   - Title: `<ID>: <short description>` (e.g. `A1: move execution out of routes`)
   - Body: `Closes #<issue>`, what/why in two sentences, verification
     evidence (command output, tx hashes for on-chain gates), the docs
     checklist copied with boxes ticked.
   - Base `main`. Keep the diff reviewable; if it grows past ~600 lines of
     non-mechanical change, stop and split.
9. **Merge** only after checks pass; the issue auto-closes. Tick the task in
   the plan doc's index. Then return to step 1.

## Invariants that no PR may violate

- `lib/` never imports from `routes/` (`lint:layering`).
- The agent never signs what it didn't screen; relay-only stays relay-only.
- `KeySigner` is private — nothing outside the signer module may accept or
  transport a bare hash for signing (from A2 onward).
- The runtime never holds a Supabase credential (from D1 onward).
- User commands and canonical transaction state enter through the backend
  only (from D-milestone onward).
- Signature assembly is owner-ascending (`GS026` reverts otherwise).

## On-chain verification (B3 #87, D5 #99)

Dust transactions on BSC mainnet per the matrix in the gate issue. Record
every tx hash in the gate issue before the corresponding code PR merges.
Needed: funded test Safes for protected/starter/guarded(v1) profiles and
agent BNB for gas. Runbook lives in `scripts/test/` (created by B0).
