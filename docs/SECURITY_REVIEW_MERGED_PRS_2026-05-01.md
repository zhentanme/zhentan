# Security Review: Recent Merged Pull Requests

Date: 2026-05-01

## Scope

This document summarizes a security review of the most recent merged pull requests returned by GitHub for this repository. GitHub returned 8 merged PRs, not 10:

1. PR #35 - `chore: pre-release - settings page update`
2. PR #34 - `feat: PWA support and Profile page updates`
3. PR #30 - `feat: nanobot agent integration`
4. PR #29 - `feat: add amountUSD field to transaction proposals and enhance risk analysis`
5. PR #24 - `feat: new routes and layout`
6. PR #23 - `feat: implement onboarding enhancements and swap`
7. PR #22 - `feature: revamped UI`
8. PR #19 - `refactor: migrate API calls to a new client module for improved structure`

Each PR was reviewed at its merge commit, checking the merged-state code and relevant diffs for security vulnerabilities and potential data leaks.

## Findings

### Critical: PR #22 left `/execute` unauthenticated

At PR #22's merge commit, `server/src/index.ts` mounted `/execute` without the `auth` middleware. The execute route accepted a `txId`, loaded the transaction, and used `AGENT_PRIVATE_KEY` to co-sign and submit the user operation.

Impact: anyone who knew or guessed a queued transaction ID could trigger agent execution without authentication.

References:

- PR #22 merge state: `server/src/index.ts:69-72`
- PR #22 merge state: `server/src/routes/execute.ts:28-63`

### Critical: authenticated APIs have missing ownership checks

Several routes authenticate the caller but do not verify that the requested Safe or transaction belongs to that caller.

Examples:

- `/execute` executes any `txId` provided, without checking that the transaction belongs to the authenticated caller's Safe.
- `/transactions/:id` can update or reject arbitrary in-review transactions by ID.
- PR #30's `latest` flow trusts caller-controlled `callerId` from the body or query to resolve a Safe.
- `/status?safe=...` returns settings and patterns for arbitrary Safes, and `PATCH /status` mutates arbitrary Safe settings.
- `/users?safe=...` returns user profile data for arbitrary Safes, and `POST /users` can update arbitrary Safe profile fields.

Impact: an authenticated user can potentially read other users' transaction metadata/profile data, change screening settings, reject or execute transactions, or tamper with profiles.

References:

- PR #30 merge state: `server/src/routes/execute.ts:28-61`
- PR #30 merge state: `server/src/routes/transactions.ts:157-207`
- PR #35 merge state: `server/src/routes/status.ts:16-35`, `50-104`, `157-160`
- PR #23 merge state: `server/src/routes/users.ts:22-31`, `37-54`

### Critical: PR #34 added unauthenticated `/bot-ping`

PR #34 added `POST /bot-ping` without `auth`, even though the agent docs show an `Authorization` header. The endpoint accepts a `chatId`, marks the matching bot connection, and returns `safeAddress`, `name`, and `username`.

Impact: anyone with or able to enumerate Telegram chat IDs can confirm linked Zhentan users, leak Safe/name/username mappings, and mark bot-connected state.

Reference:

- PR #34 merge state: `server/src/index.ts:129-162`

### High: PR #29 risk analysis trusts client-provided `amountUSD`

PR #29 introduced `amountUSD` from the client and changed risk scoring and pattern learning to prefer `tx.amountUSD ?? tx.amount`.

Impact: a tampered client or request can submit a large transfer with `amountUSD: "0"` or another small value, bypassing amount limits, velocity checks, and learned-pattern thresholds. This undermines the core transaction screening model.

References:

- PR #29 merge state: `client/src/lib/propose.ts:223-228`
- PR #29 merge state: `server/src/risk.ts:339-345`
- PR #29 merge state: `server/src/lib/supabase/db.ts:317-323`

### High: PR #29 automatic swap retries allow up to 49% slippage

PR #29 added automatic slippage escalation up to `0.49` and treats broad errors, including `"execution reverted"`, as slippage errors.

Impact: users can be pushed into executing swaps with extreme slippage without explicit confirmation of the final tolerance, creating major loss and MEV exposure.

References:

- PR #29 merge state: `client/src/components/SwapPanel.tsx:34-57`, `91-160`
- PR #29 merge state: `server/src/routes/swap.ts:475-512`

### Medium: PR #19 logs Privy identity tokens in the browser

PR #19 added `console.log(identityToken)` in `AuthContext`.

Impact: identity JWTs can leak through shared browser logs, debugging tools, extensions, support recordings, or remote logging integrations.

Reference:

- PR #19 merge state: `client/src/app/context/AuthContext.tsx:23-29`

### Low: PR #34 committed `.DS_Store`

PR #34 committed `.DS_Store`. The file was inspected with `strings`; no secrets were found. Committing local metadata files is still a hygiene and potential data-leak risk.

## No finding

No security-significant issue was identified in PR #24 beyond the broader authorization-model risks listed above.

## Recommended remediation themes

- Enforce authorization at the route level and validate that every Safe, transaction, and profile resource belongs to the authenticated caller.
- Remove caller-controlled authority fields such as body/query `callerId`; derive caller identity server-side from the verified token or agent secret context.
- Require authentication for bot integration endpoints, including `/bot-ping`, and avoid returning unnecessary PII.
- Derive risk-critical transaction values server-side or from trusted quote/on-chain data instead of trusting client-submitted USD values.
- Require explicit user confirmation for high slippage and cap automatic retry slippage to a safer threshold.
- Remove sensitive logs and add lint/static checks to catch token logging and local metadata files.
