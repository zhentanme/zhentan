# Zhentan Client

Next.js frontend for the Zhentan wallet: dashboard, send/receive USDC, activity, invoice requests, settings.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page — project overview, architecture diagram, features |
| `/deck` | Interactive slide deck — 8 slides, keyboard navigable (← →) |
| `/login` | Sign in with Google via Privy |
| `/app` | Main wallet dashboard |

## Prerequisites

- Node.js 18+
- npm (or pnpm / yarn)

## Setup

1. **Install dependencies**

   ```bash
   cd client
   npm install
   # or Prefer yarn if you face dependency issues in packages
   yarn install

   ```

2. **Configure environment**

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and set at least:

   - `NEXT_PUBLIC_PIMLICO_API_KEY` (Pimlico bundler/paymaster API key)
   - `NEXT_PUBLIC_AGENT_ADDRESS` (NanoBot/Hermes agent wallet address)
   - `NEXT_PUBLIC_BACKEND_URL` (local: `http://localhost:3001` or your deployed API URL)
   - `NEXT_PUBLIC_PRIVY_APP_ID` (Privy app ID)
   - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (WalletConnect project ID, for mobile app support)
## Run

**Development**

```bash
npm run dev 
# or Prefer yarn if you face dependency issues in packages
yarn dev
```


App runs at [http://localhost:3000](http://localhost:3000). Restart the dev server after changing `.env.local`.

**Production**

```bash
npm run build
npm start
# or
yarn build
yarn start
```

**Lint**

```bash
npm run lint
# or
yarn lint
```
