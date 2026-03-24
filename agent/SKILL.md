---
name: zhentan
description: Monitors pending multisig transactions, analyzes risk, and auto-signs safe ones. Use when the user wants to check pending transactions, approve or reject transactions, toggle screening, or view transaction status.
metadata:
  openclaw:
    requires:
      bins: ["node"]
    primaryEnv: ""
---

# Zhentan — Treasury Transaction Monitor

Monitors pending multisig transactions, analyzes risk, and auto-signs safe ones.

## How it works

1. **Owner** runs `propose-tx.js` which signs a USDC transfer and POSTs the userOp + signature to the Zhentan Express server (`/queue`)
2. **Server** (Express) receives the tx, runs inline risk analysis, and:
   - **APPROVE** (risk < 40): auto-executes the tx on-chain and sends a Telegram notification
   - **REVIEW** (risk 40-70): marks `inReview`, sends a Telegram notification asking the owner to approve or reject
   - **BLOCK** (risk > 70): marks `inReview`, sends an urgent Telegram alert with full risk breakdown
3. **Agent** (you) handles conversational responses: the owner can approve, reject, request deeper analysis, or check status via Telegram

Your role is **conversational** — the server handles the deterministic pipeline. You respond to user commands and provide analysis when asked.

## Transaction lifecycle

- **pending** → new tx, not yet processed by the server
- **in_review** → server flagged it (REVIEW or BLOCK), waiting for owner to approve or reject
- **executed** → signed and submitted on-chain
- **rejected** → owner rejected it

## Owner commands (via Telegram)

**CRITICAL RULE: For ALL commands below — EXECUTE the scripts IMMEDIATELY. Do NOT describe what you plan to do. Do NOT say "I'm running..." or "Let me...". Just run the command, wait for the result, then reply with the actual outcome.**

### approve
When the owner says "approve tx-XXX" or taps the ✅ Approve button:

1. IMMEDIATELY run (no preamble):
```bash
node skills/zhentan/sign-and-execute.js tx-XXX
```
2. WAIT for the output. If successful, run:
```bash
node skills/zhentan/record-pattern.js tx-XXX
```
3. Update the Telegram notification:
```bash
curl -s -X POST http://localhost:3001/notify-resolve -H 'Content-Type: application/json' -d '{"txId":"tx-XXX","action":"approved","txHash":"THE_TX_HASH"}'
```
4. Reply with the actual tx hash from the script output.

The tx-id includes the "tx-" prefix (e.g. `tx-cc34ee59`). Pass it exactly as the user wrote it.

### reject
When the owner says "reject tx-XXX" or taps the ❌ Reject button:

1. IMMEDIATELY run (no preamble):
```bash
node skills/zhentan/reject-tx.js tx-XXX [reason]
```
2. Update the Telegram notification:
```bash
curl -s -X POST http://localhost:3001/notify-resolve -H 'Content-Type: application/json' -d '{"txId":"tx-XXX","action":"rejected"}'
```
3. Reply confirming the rejection with actual script output.

### get-status
Get current screening mode and recent decisions. Optionally pass a Safe address to get status for a specific user.
```bash
node skills/zhentan/get-status.js [safeAddress]
```

### toggle-screening
When the owner says "screening on" or "screening off". Optionally pass a Safe address to toggle for a specific user (omit to toggle for all users).
```bash
node skills/zhentan/toggle-screening.js <on|off> [safeAddress]
```

## When user asks for deeper analysis

**CRITICAL: Do NOT describe what you plan to do. Do NOT say "I'm running..." or "hang tight". IMMEDIATELY execute the script below, WAIT for it to finish, then reply with the ACTUAL results.**

When the owner taps the "🔎 Deep Analyze" button or asks for detail about a transaction (e.g. "analyze tx-XXX", "why was this flagged?", "is this safe?", "check tx-XXX"):

1. IMMEDIATELY run (do not explain first, just run it):
```bash
node skills/zhentan/deep-analyze.js <tx-id>
```
2. WAIT for the script output (it takes 5-15 seconds to call external APIs)
3. Parse the JSON output and present the ACTUAL findings to the owner:
   - Recipient address reputation — any scam, phishing, sanctions, or money laundering flags
   - Token security — honeypot, mintable, blacklist, hidden owner, tax rates
   - Honeypot simulation results (non-stablecoins only)
4. Highlight any red flags prominently. If all clear, reassure the owner.

**Do NOT reply until you have the script output. Never narrate your intent — only report actual results.**

For a quick internal risk score (patterns-based only, no external APIs), use:
```bash
node skills/zhentan/analyze-risk.js <tx-id>
```

## Invoice Detection

When a user sends an invoice file or message containing an invoice:

1. Read the invoice and extract:
   - **to** (wallet address, required) — the recipient's blockchain address
   - **amount** (required) — total amount due
   - **token** — payment token (default: USDC)
   - **invoiceNumber** — invoice reference number
   - **issueDate** / **dueDate** — dates
   - **billedFrom** — sender company name + email
   - **billedTo** — recipient company name + email
   - **services** — line items with description, qty, rate, total
   - **riskScore** (0-100) — your assessment based on:
     - Known vs unknown recipient (check patterns.json)
     - Amount relative to history
     - Due date urgency
   - **riskNotes** — brief explanation of your risk assessment

2. Queue the invoice:
   ```bash
   node skills/zhentan/queue-invoice.js '<json>'
   ```

3. Confirm to the user: "Invoice [number] for [amount] [token] queued for review. Check your Zhentan dashboard to approve."

If the invoice is missing a wallet address, ask the user to provide one.

## Risk scoring reference

- Unknown recipient: +40
- Amount > 3x average for known recipient: +25
- Outside business hours (UTC 6-20): +20
- Exceeds single-tx limit (default 5000 USDC): +30
- Would exceed daily volume limit (default 20000 USDC): +20

Verdicts: APPROVE (<40), REVIEW (40-70), BLOCK (>70)
