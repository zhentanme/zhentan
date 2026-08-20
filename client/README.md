# Zhentan Client

Next.js frontend for the Zhentan wallet: dashboard, send/receive, activity, payment requests, settings, and onboarding (profile choice + Safe creation).

The client never derives Safe addresses locally — it gets them from the server (`GET /users/by-signer` for existing users, `POST /safe/derive` for new ones).

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page — project overview, architecture diagram, features |
| `/deck` | Interactive slide deck — keyboard navigable (← →) |
| `/login` | Sign in with Google via Privy |
| `/app` | Main wallet dashboard (send, activity, requests, settings) |
| `/onboarding` | Profile choice + account setup |

## Prerequisites

- Node.js 18+
- pnpm 10+ (this repo is a pnpm workspace — install from the root)

## Setup

1. **Install dependencies** (from the repo root)

   ```bash
   pnpm install
   ```

2. **Configure environment**

   ```bash
   cd client
   cp .env.example .env.local
   ```

   Edit `.env.local` and set at least:

   - `NEXT_PUBLIC_AGENT_ADDRESS` (the agent owner EOA address — its key lives in `runtime/`)
   - `NEXT_PUBLIC_BACKEND_URL` (local: `http://localhost:3001` or your deployed API URL)
   - `NEXT_PUBLIC_PRIVY_APP_ID` (Privy app ID)
   - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (WalletConnect project ID, for mobile app support)

## Run

**Development**

```bash
pnpm dev
```

App runs at [http://localhost:3000](http://localhost:3000). Restart the dev server after changing `.env.local`.

**Production**

```bash
pnpm build   # also syncs agent/SKILL.md → public/SKILL.md
pnpm start
```

**Lint**

```bash
pnpm lint
```
