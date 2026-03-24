# Zhentan Skills

OpenClaw skill pack for **Zhentan** — a treasury monitor agent that watches pending multisig transactions, analyzes risk, auto-signs safe ones, flags risky ones for review, and handles invoices.

---

## Prerequisites

| Requirement | Details |
|---|---|
| **OpenClaw** | Installed and configured — [OpenClaw setup guide](https://github.com/anthropics/openclaw) |
| **Node.js** | v18 or higher |
| **Environment variables** | Same config as the [Zhentan server](../server/README.md): `QUEUE_PATH`, `INVOICE_QUEUE_PATH`, `AGENT_PRIVATE_KEY`, `PIMLICO_API_KEY`, etc. These must be set in the environment where OpenClaw runs. |

---

## Quick Start

### 1. Link the skill into OpenClaw

From the Zhentan repo root:

```bash
mkdir -p ~/.openclaw/workspace/skills
ln -sf "$(pwd)/zhentan-skills" ~/.openclaw/workspace/skills/zhentan
```

### 2. Restart OpenClaw

```bash
openclaw gateway restart
```

Confirm that the zhentan skill is detected.

```bash
openclaw skills check
```

OpenClaw will load the skill from `SKILL.md` and begin responding to commands via Telegram.

---

## Alternative Skill Install Methods

### Copy into OpenClaw's skill directory

```bash
mkdir -p ~/.openclaw/skills
cp -r /path/to/zhentan/zhentan-skills ~/.openclaw/skills/zhentan
```

> If you copy, remember to re-copy after editing the skill source.

### Project-local skills

Create a symlink at the repo root so OpenClaw discovers it locally:

```bash
mkdir -p .openclaw/skills
ln -sf "$(pwd)/zhentan-skills" .openclaw/skills/zhentan
```



For full usage details and owner commands, see **[SKILL.md](./SKILL.md)**.
