# Zhentan Skill Pack

NanoBot/Hermes skill pack for **Zhentan** — a conversational security agent that acts on owner commands (review pending transactions, approve/reject, check risk scores, manage screening rules, queue payment requests) through the **zhentan MCP tools**.

The pack holds **no keys** and performs **no signing or risk analysis itself**: screening runs in the Zhentan runtime (`runtime/`), the agent signing key lives only there, and every server operation goes through the MCP server (`mcp/`) — never raw HTTP.

---

## Prerequisites

| Requirement | Details |
|---|---|
| **NanoBot/Hermes** | Installed and configured — [NanoBot/Hermes setup guide](https://nanobot.wiki/) |
| **Node.js** | v18 or higher |
| **Zhentan MCP server** | The skill talks to the backend exclusively through the `zhentan` MCP tools — see [mcp/README.md](../mcp/README.md) for setup. Its environment needs `ZHENTAN_API_URL` (**required** — the MCP server fails loudly rather than defaulting to production) and `AGENT_SECRET` (must match the server's `AGENT_SECRET`). |

> **Do not** set `AGENT_PRIVATE_KEY` or `PIMLICO_API_KEY` here or on the server for this skill. The agent signing key belongs in `runtime/.env` only — the server logs a SECURITY error if it finds `AGENT_PRIVATE_KEY` in a production backend environment.

---

## Quick Start

### 1. Link the skill into NanoBot/Hermes

From the Zhentan repo root:

```bash
mkdir -p ~/.nanobot/workspace/skills
ln -sf "$(pwd)/agent" ~/.nanobot/workspace/skills/zhentan
```

### 2. Restart NanoBot/Hermes

```bash
nanobot gateway restart
```

Confirm that the zhentan skill is detected.

```bash
nanobot skills check
```

NanoBot/Hermes will load the skill from `SKILL.md` and begin responding to commands via Telegram.

---

## Alternative Skill Install Methods

### Copy into NanoBot/Hermes's skill directory

```bash
mkdir -p ~/.nanobot/skills
cp -r /path/to/zhentan/agent ~/.nanobot/skills/zhentan
```

> If you copy, remember to re-copy after editing the skill source.

### Project-local skills

Create a symlink at the repo root so NanoBot/Hermes discovers it locally:

```bash
mkdir -p .nanobot/skills
ln -sf "$(pwd)/agent" .nanobot/skills/zhentan
```

For full usage details and owner commands, see **[SKILL.md](./SKILL.md)**.
