> **Legacy 4337 flow.** These CLI scripts exercise the ERC-4337 userOp pipeline
> (execution_mode "4337" and the 2-of-2 → 2-of-3 upgrade tx). The app's default
> flow is now SafeTx-based: proposals go to the Safe Transaction Service
> (visible in app.safe.global) and the agent relays execTransaction — see
> server/src/lib/safe/ and CLAUDE.md.

## The user and agent signing flow:


OWNER                                    AGENT (Zhentan)
  ─────                                    ─────────────────
  node propose-tx.js
    │
    ├─ prepareUserOperation()
    ├─ sign with PRIVATE_KEY (owner 1)
    └─ write to pending-queue.json ──────► cron picks up (every 30s)
                                             │
                                             ├─ check-pending.js
                                             ├─ analyze-risk.js <tx-id>
                                             │
                                      ┌──────┴──────┐
                                   APPROVE        REVIEW/BLOCK
                                      │               │
                            sign-and-execute.js    Telegram alert
                                      │
                                ┌─────▼──────┐
                                │ agent-sign  │
                                │   .js       │
                                └─────┬──────┘
                                      │
                                ├─ sign with PRIVATE_KEY2 (agent)
                                ├─ pack signatures
                                ├─ sendUserOperation()
                                └─ update pending-queue.json
