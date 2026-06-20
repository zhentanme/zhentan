# AI Build Log

> How AI tools assisted in building Zhentan for the Good Vibes Only: OpenClaw Edition hackathon.

## By the Numbers

| Metric | Value |
|--------|-------|
| AI-assisted commits | 27 |
| Hackathon duration | 14 days |
| Primary AI use | UI housekeeping, docs, config debugging |
| Core logic written by | Hand |

Full commit history and contributor activity: [github.com/koshikraj/zhentan/graphs/contributors](https://github.com/koshikraj/zhentan/graphs/contributors)

---

## Tools Used

| Tool | Role |
|------|------|
| **Claude Code** (Anthropic CLI) | Assisted with documentation, UI housekeeping, and code reviews |
| **Cursor** | UI component updates and styling iterations |
| **NanoBot/Hermes Agent** (Qwen3-235B / Claude Sonnet via OpenRouter) | The AI agent that IS the product — also used during development to debug server config issues |

---

## Where AI Assisted

### 1. Bootstrapping (Claude Code)

Claude Code helped bootstrap both the Express server and the Next.js client through heavy prompting — setting up the project structure, API route layout, middleware, TypeScript config, and Privy + viem integration scaffolding. This significantly sped up getting both ends talking to each other. From there, the core logic — risk scoring, Safe multisig setup, ERC-4337 pipeline, NanoBot/Hermes skill design — was built and iterated by hand.

### 2. UI Housekeeping (Claude Code + Cursor)

AI tools took the load off repetitive UI work, freeing time to focus on what mattered.

**Claude Code** assisted with the landing page, deck page, and overall page designs.

**Cursor** assisted with iterating on UI component updates — TransactionDetailDialog, TransactionRow, SendPanel, TopBar, settings and profile pages.

**Key commits with AI assistance:**
- `4d37106` — `feat: redesign landing page with animated architecture diagram and routing`
- `3a956cc` — `feat: implement risk gauge and slide features in deck page`
- `e310e0a` — `style: redesign settings and profile pages with glass morphism and gold accents`
- `c0d3cb2` — `feat: add risk assessment details to TransactionDetailDialog and TransactionRow`
- `1d4a7e6` — `feat: enhance SendPanel and TransactionDetailDialog with token icon support`

### 2. Documentation (Claude Code)

Writing structured hackathon docs is time-consuming. Claude Code helped draft and maintain:
- `docs/PROJECT.md` — problem, solution, Mermaid diagrams, roadmap
- `docs/TECHNICAL.md` — architecture diagrams, setup instructions, demo guide
- `docs/ONCHAIN.md` — live transaction log with decoded chain data
- `bsc.address` — contract registry in JSON format

All content was reviewed and corrected where the AI got the architecture wrong (e.g. the agent's conversational role vs. the server's deterministic pipeline, cron flow removal).

**Commit:** `80d495e` — `docs: add hackathon starter kit documentation structure`

### 3. Debugging Server Config (NanoBot/Hermes Agent)

The NanoBot/Hermes agent was used beyond its product role — during development, it helped debug server-side configuration issues by inspecting config files, tracing environment variable mismatches, and suggesting fixes for the queue path setup and Telegram webhook wiring. A nice meta moment: using the product to build the product.

---

## AI as the Product (NanoBot/Hermes Agent)

Separately from build assistance, the NanoBot/Hermes agent is the core of Zhentan itself:

- **Holds the 2nd key** on every user's Safe 2-of-2 multisig — no transaction executes without its signature
- **Communicates with the user** via Telegram — sends risk reports, approve/reject buttons, blocked alerts
- **Runs deep analysis** on REVIEW-tier transactions (GoPlus + Honeypot.is) before the user decides
- **Signs and executes** approved UserOperations via the ERC-4337 bundler
- **Records behavioral patterns** after every confirmed transaction to improve future screening
- **Handles invoices** — extracts structured data from invoice messages and queues them for dashboard review

The agent runs on Qwen3-235B / Claude Sonnet 4.5 via OpenRouter, with `SKILL.md` as its operating instructions.

---

