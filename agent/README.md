# Zhentan Skills

NanoBot/Hermes skill pack for **Zhentan** — a treasury monitor agent that watches pending multisig transactions, analyzes risk, auto-signs safe ones, flags risky ones for review, and handles invoices.

---

## Prerequisites

| Requirement | Details |
|---|---|
| **NanoBot/Hermes** | Installed and configured — [NanoBot/Hermes setup guide](https://nanobot.wiki/) |
| **Node.js** | v18 or higher |
| **Environment variables** | `AGENT_SECRET` (required — authenticates skill calls to the server). `ZHENTAN_API_URL` (optional — server base URL; defaults to `https://api.zhentan.me`, set `http://localhost:3001` for local dev). Plus server config per the [Zhentan server](../server/README.md): `AGENT_PRIVATE_KEY`, `PIMLICO_API_KEY`, etc. All must be set in the environment where NanoBot/Hermes runs. |

---

## Quick Start

### 1. Link the skill into NanoBot/Hermes

From the Zhentan repo root:

```bash
mkdir -p ~/.nanobot/workspace/skills
ln -sf "$(pwd)/zhentan-skills" ~/.nanobot/workspace/skills/zhentan
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
cp -r /path/to/zhentan/zhentan-skills ~/.nanobot/skills/zhentan
```

> If you copy, remember to re-copy after editing the skill source.

### Project-local skills

Create a symlink at the repo root so NanoBot/Hermes discovers it locally:

```bash
mkdir -p .nanobot/skills
ln -sf "$(pwd)/zhentan-skills" .nanobot/skills/zhentan
```



For full usage details and owner commands, see **[SKILL.md](./SKILL.md)**.
