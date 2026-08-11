import "dotenv/config";
import crypto from "node:crypto";
import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import { verifyPrivyToken } from "./lib/privy.js";
import { getSafeAddressFromCallerId } from "./lib/caller.js";
import { getUserBySignerAddress } from "./lib/supabase/index.js";
import type { UserDetailsRow } from "./lib/supabase/types.js";
import { createTransactionsRouter } from "./routes/transactions.js";
import { createQueueRouter } from "./routes/queue.js";
import { createExecuteRouter } from "./routes/execute.js";
import { createRequestsRouter } from "./routes/requests.js";
import { createPortfolioRouter } from "./routes/portfolio.js";
import { createStatusRouter, getTelegramChatIdForSafe } from "./routes/status.js";
import { createResolveRouter } from "./routes/resolve.js";
import { createRulesRouter } from "./routes/rules.js";
import { createEventsRouter } from "./routes/events.js";
import { createAnalyzeRouter } from "./routes/analyze.js";
import { createUsersRouter } from "./routes/users.js";
import { createCampaignsRouter } from "./routes/campaigns.js";
import { createTokensRouter } from "./routes/tokens.js";
import { createPayoutRouter } from "./routes/payout.js";
import { createSwapRouter } from "./routes/swap.js";
import { createRuntimeRouter } from "./routes/runtime.js";
import { createNotificationsRouter } from "./routes/notifications.js";
import { createSafeRouter } from "./routes/safe.js";
import { startSafeSyncWorker } from "./workers/safeSync.js";
import { assertSponsorGas } from "./lib/chain/sponsor.js";
import { editNotification } from "./notify.js";
import { markBotConnectedByChatId, getUserByTelegramId } from "./lib/supabase/index.js";

const app = express();

const AGENT_SECRET = process.env.AGENT_SECRET;
const IS_PROD = process.env.NODE_ENV === "production";
/** Escape hatch for local dev without secrets. Refused in production. */
const DEV_OPEN = process.env.DEV_OPEN === "1" && !IS_PROD;

// Fail closed at boot, not per-request: a missing secret is a deployment fault,
// and the only safe way to surface it is to refuse to serve at all. The old
// behaviour (`if (!AGENT_SECRET) return next()`) turned a missing env var into a
// silently unauthenticated public API.
const REQUIRED_PRODUCTION_ENVS = ["AGENT_SECRET"] as const;
if (IS_PROD) {
  const missing = REQUIRED_PRODUCTION_ENVS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Refusing to start: required production env(s) unset: ${missing.join(", ")}. ` +
        `Set them, or run with NODE_ENV != production for local development.`
    );
  }
} else if (!AGENT_SECRET && !DEV_OPEN) {
  throw new Error(
    "Refusing to start: AGENT_SECRET is unset. Set it, or set DEV_OPEN=1 to run " +
      "local development with authentication disabled (refused when NODE_ENV=production)."
  );
}
if (DEV_OPEN) {
  console.warn(
    "⚠️  DEV_OPEN=1 — authentication is DISABLED and every protected route is open. " +
      "Local development only."
  );
}

declare global {
  namespace Express {
    interface Request {
      callerId?: string;
      /**
       * The one Safe this caller may read or write, resolved server-side from
       * the verified principal. Never populated from a request field — see
       * lib/authz.ts. Undefined means "no Safe", which is a 403, not a pass.
       */
      callerSafe?: string;
      /**
       * The embedded wallet address proven by the Privy token. Survives even
       * when no `user_details` row matches it yet, which is the entire
       * onboarding window — `/users` authorizes against this rather than
       * `user`, since the row it is creating cannot vouch for itself.
       */
      signerAddress?: string;
      /**
       * Populated for authenticated client calls (Privy token).
       * Contains the full user_details row resolved via the embedded wallet address.
       * Undefined for agent calls or when the user hasn't completed onboarding.
       */
      user?: UserDetailsRow;
    }
  }
}

/**
 * Length-independent comparison for shared secrets. `===` on a string leaks the
 * length of the matching prefix through timing, which is enough to recover a
 * secret byte-by-byte over many requests.
 */
function secretEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on length mismatch; compare against a same-length
  // copy so the answer is always produced in constant time for a given `b`.
  if (left.length !== right.length) {
    crypto.timingSafeEqual(right, right);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

/**
 * Resolves an agent caller's principal. `callerId` names which user the agent is
 * acting for; it is an identity *claim*, resolved here to a Safe and thereafter
 * only ever read from `req.callerSafe`. Routes must not re-read it from the body.
 */
async function resolveAgentPrincipal(req: Request) {
  const callerId = req.body?.callerId ?? (req.query.callerId as string) ?? undefined;
  req.callerId = callerId;
  req.callerSafe = (await getSafeAddressFromCallerId(callerId)) ?? undefined;
}

/** Resolves a Privy caller's principal from a verified identity token. */
async function resolvePrivyPrincipal(req: Request, bearer: string) {
  const { userId, walletAddress } = await verifyPrivyToken(bearer);
  req.callerId = `privy:${userId}`;
  req.signerAddress = walletAddress ?? undefined;

  // Resolve the caller's Safe from their embedded wallet, so routes never need
  // to take it from the body/query.
  if (walletAddress) {
    const user = await getUserBySignerAddress(walletAddress);
    if (user) {
      req.user = user;
      req.callerSafe = user.safe_address;
    }
  }
}

async function auth(req: Request, res: Response, next: NextFunction) {
  const bearer = req.headers["authorization"]?.replace("Bearer ", "");

  // Dev-only: accept the request without proving anything, but still resolve a
  // principal. Routes authorize against `req.callerSafe`, so skipping straight
  // to next() would 403 every Safe-scoped route and make this mode useless.
  if (DEV_OPEN) {
    if (bearer) {
      await resolvePrivyPrincipal(req, bearer).catch(() => undefined);
    }
    if (!req.callerSafe) await resolveAgentPrincipal(req);
    return next();
  }

  if (!AGENT_SECRET) {
    // Unreachable given the boot guard, but a route must never serve traffic on
    // the assumption that a secret exists.
    res.status(503).json({ error: "Service is misconfigured for authentication" });
    return;
  }

  if (!bearer) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Agent call — shared secret.
  if (secretEquals(bearer, AGENT_SECRET)) {
    await resolveAgentPrincipal(req);
    return next();
  }

  // Client call — verify as Privy identity token
  try {
    await resolvePrivyPrincipal(req, bearer);
    return next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());

app.use("/portfolio", createPortfolioRouter());   // public — client reads
app.use("/tokens", createTokensRouter());         // public — market data
app.use("/events", auth, createEventsRouter());   // behavioral log — own Safe only
app.use("/transactions", auth, createTransactionsRouter());
app.use("/queue", auth, createQueueRouter());
app.use("/execute", auth, createExecuteRouter());
const requestsRouter = createRequestsRouter();
app.use("/requests", auth, requestsRouter);
app.use("/invoices", auth, requestsRouter); // legacy alias — deployed agent skill still calls /invoices
app.use("/status", auth, createStatusRouter());
app.use("/rules", auth, createRulesRouter());
app.use("/resolve", auth, createResolveRouter());
app.use("/analyze", auth, createAnalyzeRouter());
app.use("/users", auth, createUsersRouter());
app.use("/campaigns", auth, createCampaignsRouter());
app.use("/payout", createPayoutRouter()); // admin-key protected internally
app.use("/swap", auth, createSwapRouter());
app.use("/runtime", createRuntimeRouter()); // runtime worker — own bearer auth, fail-closed
app.use("/notifications", createNotificationsRouter());
app.use("/safe", auth, createSafeRouter());

app.post("/notify-resolve", auth, async (req, res) => {
  const { txId, action, txHash } = req.body ?? {};
  if (!txId || !action) {
    res.status(400).json({ error: "Missing txId or action" });
    return;
  }
  // The chat to edit is derived from the caller, not from a body-supplied Safe —
  // otherwise anyone authenticated could post a resolution into another user's
  // Telegram thread.
  const safeAddress = req.callerSafe;

  let message: string;
  if (action === "approved") {
    message = `✅ Approved — ${txId}`;
    if (txHash) message += `\nTX: https://bscscan.com/tx/${txHash}`;
  } else if (action === "rejected") {
    message = `❌ Rejected — ${txId}`;
  } else {
    message = `${action} — ${txId}`;
  }

  let chatId: string | undefined;
  try {
    if (safeAddress) {
      chatId = await getTelegramChatIdForSafe(safeAddress);
    }
  } catch { /* ignore */ }

  editNotification(txId, message, chatId);
  res.json({ ok: true });
});

// POST /bot-ping — called by the NanoBot/Hermes agent on /start.
// Marks bot_connected = true for the safe mapped to this chatId and returns user details
// so the agent can craft a proper greeting.
app.post("/bot-ping", async (req, res) => {
  const chatId = String(req.body?.chatId ?? "");
  if (!chatId) {
    res.status(400).json({ error: "Missing chatId" });
    return;
  }

  try {
    const [user] = await Promise.all([
      getUserByTelegramId(chatId),
      markBotConnectedByChatId(chatId),
    ]);

    if (!user) {
      // chatId not mapped to any user yet — they haven't linked Telegram in the app
      res.json({ ok: true, found: false });
      return;
    }

    res.json({
      ok: true,
      found: true,
      safeAddress: user.safe_address,
      name: user.name,
      username: user.username,
    });
  } catch (err) {
    console.error("bot-ping: failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// GET /me?chatId=<telegramChatId> — called by the agent to fetch user profile.
// Returns name, email, username, safeAddress, signerAddress for the given Telegram chat ID.
app.get("/me", auth, async (req, res) => {
  const chatId = String(req.query.chatId ?? "");
  if (!chatId) {
    res.status(400).json({ error: "Missing chatId" });
    return;
  }

  try {
    const user = await getUserByTelegramId(chatId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      safeAddress: user.safe_address,
      signerAddress: user.signer_address,
      name: user.name,
      username: user.username,
      email: user.email,
    });
  } catch (err) {
    console.error("GET /me failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`Zhentan server listening on http://localhost:${port}`);
  startSafeSyncWorker();
  // Surface a low agent gas balance at boot rather than on the first execute.
  if (process.env.AGENT_PRIVATE_KEY) {
    assertSponsorGas().catch((err) => console.error("Startup gas check failed:", err));
  }
});
