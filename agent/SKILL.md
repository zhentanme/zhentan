---
name: zhentan
description: Zhentan is your personal onchain security agent and co-signer. It monitors pending multisig transactions, screens them against behavioral patterns and security risk data, and auto-signs safe ones — blocking or flagging suspicious activity before it executes. Use when the user wants to review pending transactions, approve or reject a transaction, check risk scores, toggle screening mode, view transaction history, or queue and process an invoice.
metadata:
  openclaw:
    requires:
      bins: ["node", "curl"]
    primaryEnv: "SERVER_URL"
---

# Zhentan — Onchain Security Agent & Co-Signer

Zhentan acts as an intelligent co-signer on your Safe smart account. It learns how you transact — amounts, timing, tokens and recipients — and screens every pending transaction against your behavioral profile and external security scanners (GoPlus, Honeypot.is, De.fi) before execution.

Safe transactions are auto-signed and executed instantly. Borderline ones are surfaced for your review. Clearly malicious transactions are blocked outright.

Base URL: `https://api.zhentan.me` (override with `$SERVER_URL`)

## How it works

1. **Owner** proposes a transaction — signs 1-of-2, POSTs to `POST /queue`
2. **Server** runs inline risk analysis and either:
   - **APPROVE** (risk < 40): auto-executes on-chain, sends Telegram notification
   - **REVIEW** (risk 40–70): marks `inReview`, sends Telegram asking owner to approve/reject
   - **BLOCK** (risk > 70): marks `inReview`, sends urgent Telegram alert
3. **Agent** (you) handles owner commands via Telegram — execute scripts, call endpoints, report results

Your role is **conversational** — the server owns the deterministic pipeline.

## Transaction lifecycle

- `pending` → queued, not yet processed
- `in_review` → flagged by server (REVIEW or BLOCK), awaiting owner decision
- `executed` → co-signed and submitted on-chain
- `rejected` → owner rejected it

---

## Owner commands

**CRITICAL RULE: EXECUTE immediately. Do NOT say "I'm running…" or "Let me…". Run the command, wait for the result, reply with the actual outcome.**

### approve `tx-XXX`
When the owner says "approve tx-XXX" or taps ✅ Approve:

1. Co-sign and execute (uses `sign-and-execute.js` — kept as a script for future extensibility):
```bash
node skills/zhentan/sign-and-execute.js tx-XXX
```
2. Update the Telegram notification with the tx hash from step 1:
```bash
curl -s -X POST https://api.zhentan.me/notify-resolve \
  -H 'Content-Type: application/json' \
  -d '{"txId":"tx-XXX","action":"approved","txHash":"THE_TX_HASH"}'
```
3. Reply with the actual tx hash.

The tx-id includes the `tx-` prefix (e.g. `tx-cc34ee59`). Pass it exactly as written.

### reject `tx-XXX`
When the owner says "reject tx-XXX" or taps ❌ Reject:

1. Mark rejected (optionally include a reason):
```bash
curl -s -X PATCH https://api.zhentan.me/transactions/tx-XXX \
  -H 'Content-Type: application/json' \
  -d '{"action":"reject","reason":"Rejected by owner"}'
```
2. Update the Telegram notification:
```bash
curl -s -X POST https://api.zhentan.me/notify-resolve \
  -H 'Content-Type: application/json' \
  -d '{"txId":"tx-XXX","action":"rejected"}'
```
3. Reply confirming the rejection.

### mark for review `tx-XXX`
When you need to flag a transaction for manual review:
```bash
curl -s -X PATCH https://api.zhentan.me/transactions/tx-XXX \
  -H 'Content-Type: application/json' \
  -d '{"action":"review","reason":"Flagged for manual review"}'
```

### check pending
Check if there are pending transactions for a Safe:
```bash
# 1. Check screening mode
curl -s "https://api.zhentan.me/status?safe=0xSAFE_ADDRESS"

# 2. List transactions (filter client-side for !executedAt && !inReview && !rejected)
curl -s "https://api.zhentan.me/transactions?safeAddress=0xSAFE_ADDRESS"
```

### get status
Get screening mode, patterns, and global limits for a Safe:
```bash
curl -s "https://api.zhentan.me/status?safe=0xSAFE_ADDRESS"
```

### toggle screening
Turn screening on or off for a Safe:
```bash
# Turn on
curl -s -X PATCH https://api.zhentan.me/status \
  -H 'Content-Type: application/json' \
  -d '{"safe":"0xSAFE_ADDRESS","screeningMode":true}'

# Turn off
curl -s -X PATCH https://api.zhentan.me/status \
  -H 'Content-Type: application/json' \
  -d '{"safe":"0xSAFE_ADDRESS","screeningMode":false}'
```

### update limits
Update global limits for a Safe (any combination of fields):
```bash
curl -s -X PATCH https://api.zhentan.me/status \
  -H 'Content-Type: application/json' \
  -d '{
    "safe": "0xSAFE_ADDRESS",
    "maxSingleTx": "5000",
    "maxDailyVolume": "20000",
    "riskThresholdApprove": 40,
    "riskThresholdBlock": 70,
    "learningEnabled": true
  }'
```

---

## Analysis commands

### quick risk score
Fetch the stored risk score for a transaction (computed at queue time):
```bash
curl -s "https://api.zhentan.me/transactions/tx-XXX"
# Returns: riskScore, riskVerdict, riskReasons
```

### deep analyze `tx-XXX`
**CRITICAL: IMMEDIATELY run, WAIT for response (5–15s), then report ACTUAL findings.**

When the owner taps 🔎 Deep Analyze or asks "analyze tx-XXX", "is this safe?", "why was this flagged?":

```bash
curl -s "https://api.zhentan.me/analyze/tx-XXX"
```

Parse the JSON and present:
- `addressSecurity.flags` — scam, phishing, sanctions, money laundering
- `tokenSecurity.flags` — honeypot, mintable, blacklist, hidden owner, tax rates
- `honeypot` — simulation results (non-stablecoins only)
- `recipient.known` / `recipient.totalTxCount` — behavioral history

Highlight red flags prominently. If `safe: true` and `totalFlags: 0`, reassure the owner.

### behavioral event log
View the event history for a Safe:
```bash
curl -s "https://api.zhentan.me/events?safe=0xSAFE_ADDRESS&limit=50"
```

---

## Rules management

### list rules
```bash
curl -s "https://api.zhentan.me/rules?safe=0xSAFE_ADDRESS"
```

### create rule
```bash
curl -s -X POST https://api.zhentan.me/rules \
  -H 'Content-Type: application/json' \
  -d '{
    "safe": "0xSAFE_ADDRESS",
    "name": "Block large transfers",
    "ruleType": "amount_limit",
    "conditions": {"maxAmount": "1000"},
    "action": "block",
    "priority": 10
  }'
```
Valid `ruleType`: `amount_limit`, `recipient_block`, `recipient_whitelist`, `time_restriction`, `velocity_limit`, `token_restriction`, `custom`
Valid `action`: `approve`, `review`, `block`

### update rule
```bash
curl -s -X PATCH https://api.zhentan.me/rules/RULE_ID \
  -H 'Content-Type: application/json' \
  -d '{"isActive": false}'
```

### delete rule
```bash
curl -s -X DELETE https://api.zhentan.me/rules/RULE_ID
```

---

## Invoice detection

When a user sends an invoice file or message:

1. Extract fields:
   - **to** (wallet address, required)
   - **amount** (required), **token** (default: USDC)
   - **invoiceNumber**, **issueDate**, **dueDate**
   - **billedFrom**, **billedTo** — `{name, email}` objects
   - **services** — `[{description, quantity, rate, total}]`
   - **riskScore** (0–100) — assess based on: known vs unknown recipient (check `GET /status`), amount vs history, due date urgency
   - **riskNotes** — brief explanation

2. Queue it:
```bash
curl -s -X POST https://api.zhentan.me/invoices \
  -H 'Content-Type: application/json' \
  -d '{"to":"0x...","amount":"500","token":"USDC","invoiceNumber":"INV-001","riskScore":20,"sourceChannel":"telegram"}'
```

3. Confirm: "Invoice [number] for [amount] [token] queued. Check your Zhentan dashboard to approve."

If the invoice is missing a wallet address, ask the user to provide one.

### list invoices
```bash
curl -s "https://api.zhentan.me/invoices"
```

### update invoice status
```bash
curl -s -X PATCH https://api.zhentan.me/invoices \
  -H 'Content-Type: application/json' \
  -d '{"id":"inv-XXXXXXXX","status":"approved","txId":"tx-XXX"}'
```
Valid `status`: `queued`, `approved`, `executed`, `rejected`

---

## Risk scoring reference

| Factor | Score |
|--------|-------|
| Unknown recipient | +40 |
| Amount > 3× recipient average | +25 |
| Outside allowed hours (UTC) | +20 |
| Exceeds single-tx limit | +30 |
| Would exceed daily volume | +20 |
| Custom rule triggered | varies |

Verdicts: **APPROVE** (<40) · **REVIEW** (40–70) · **BLOCK** (>70)
Thresholds are per-Safe and configurable via `PATCH /status`.
