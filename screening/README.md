# zhentan-screening

The pure screening core, shared **verbatim** by the server and the runtime:
the risk engine, `evaluateTransaction` / `evaluateRequest`, app transaction
types, decoded-calldata shapes, and the runtime-job wire protocol (schema
version + canonical input hash).

## Purity constraints (lint-enforced — do not break these)

`scripts/lint-pure.sh` runs in `pnpm lint` and fails the build on violations:

- **Dependency-free**: no runtime dependencies, workspace or external.
- **Env-free**: no `process.env` reads anywhere.
- **I/O-free**: no filesystem, network, or database access; evaluation
  timestamps are explicit inputs, so identical payloads replay identically.

This is what makes screening decisions deterministic and replayable across
processes — the server and the runtime import the same code and must compute
the same result from the same job payload.

Server files re-export from this package (`src/types.ts`, `safe/kind.ts`,
`agent/evaluate.ts`, `lib/runtime/jobsPolicy.ts`), so server-internal import
paths stay unchanged; the layering lint confines direct imports to those
designated re-export sites.

There is no standalone test suite — the package is exercised by the server
and runtime suites.
