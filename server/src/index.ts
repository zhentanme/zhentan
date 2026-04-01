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
import { editNotification } from "./notify.js";

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
app.use("/execute", createExecuteRouter());
app.use("/invoices", auth, createInvoicesRouter());
app.use("/status", auth, createStatusRouter());
app.use("/rules", auth, createRulesRouter());
app.use("/resolve", auth, createResolveRouter());
app.use("/analyze", auth, createAnalyzeRouter());
app.use("/users", auth, createUsersRouter());
app.use("/campaigns",  createCampaignsRouter());
app.use("/payout", createPayoutRouter());

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

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`Zhentan server listening on http://localhost:${port}`);
});
