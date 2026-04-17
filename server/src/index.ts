import "dotenv/config";
import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import { verifyPrivyToken } from "./lib/privy.js";
import { getUserBySignerAddress } from "./lib/supabase/index.js";
import type { UserDetailsRow } from "./lib/supabase/types.js";
import { createTransactionsRouter } from "./routes/transactions.js";
import { createQueueRouter } from "./routes/queue.js";
import { createExecuteRouter } from "./routes/execute.js";
import { createInvoicesRouter } from "./routes/invoices.js";
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
import { editNotification } from "./notify.js";
import { markBotConnectedByChatId, getUserByTelegramId } from "./lib/supabase/index.js";

const app = express();

const AGENT_SECRET = process.env.AGENT_SECRET;

declare global {
  namespace Express {
    interface Request {
      callerId?: string;
      /**
       * Populated for authenticated client calls (Privy token).
       * Contains the full user_details row resolved via the embedded wallet address.
       * Undefined for agent calls or when the user hasn't completed onboarding.
       */
      user?: UserDetailsRow;
    }
  }
}

async function auth(req: Request, res: Response, next: NextFunction) {
  // Skip auth entirely if AGENT_SECRET is not configured (local dev fallback)
  if (!AGENT_SECRET) return next();

  const bearer = req.headers["authorization"]?.replace("Bearer ", "");
  if (!bearer) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Agent call — simple secret comparison
  if (bearer === AGENT_SECRET) {
    req.callerId = req.body?.callerId ?? (req.query.callerId as string) ?? undefined;
    return next();
  }

  // Client call — verify as Privy identity token
  try {
    const { userId, walletAddress } = await verifyPrivyToken(bearer);
    req.callerId = `privy:${userId}`;

    // Best-effort: resolve the caller's Safe address from their embedded wallet.
    // Routes can rely on req.safeAddress instead of requiring it in the body/query.
    if (walletAddress) {
      const user = await getUserBySignerAddress(walletAddress);
      if (user) req.user = user;
    }

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
app.use("/events", createEventsRouter());          // public — client SSE stream
app.use("/transactions", auth, createTransactionsRouter());
app.use("/queue", auth, createQueueRouter());
app.use("/execute", auth, createExecuteRouter());
app.use("/invoices", auth, createInvoicesRouter());
app.use("/status", auth, createStatusRouter());
app.use("/rules", auth, createRulesRouter());
app.use("/resolve", auth, createResolveRouter());
app.use("/analyze", auth, createAnalyzeRouter());
app.use("/users", auth, createUsersRouter());
app.use("/campaigns", auth, createCampaignsRouter());
app.use("/payout", createPayoutRouter()); // admin-key protected internally
app.use("/swap", auth, createSwapRouter());

app.post("/notify-resolve", auth, async (req, res) => {
  const { txId, action, txHash, safeAddress } = req.body ?? {};
  if (!txId || !action) {
    res.status(400).json({ error: "Missing txId or action" });
    return;
  }

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

// POST /bot-ping — called by the OpenClaw agent on /start.
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

// POST /telegram-webhook — called by Telegram when a user messages the bot.
// Marks bot_connected = true for the safe address mapped to this chatId.
app.post("/telegram-webhook", async (req, res) => {
  const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (WEBHOOK_SECRET) {
    const secret = req.headers["x-telegram-bot-api-secret-token"];
    if (secret !== WEBHOOK_SECRET) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const chatId = String(req.body?.message?.chat?.id ?? req.body?.callback_query?.from?.id ?? "");
  if (!chatId || chatId === "undefined") {
    res.json({ ok: true });
    return;
  }

  try {
    await markBotConnectedByChatId(chatId);
  } catch (err) {
    console.error("telegram-webhook: failed to mark bot_connected:", err);
  }

  res.json({ ok: true });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`Zhentan server listening on http://localhost:${port}`);
});
