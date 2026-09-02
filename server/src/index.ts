import "dotenv/config";
import cors from "cors";
import express from "express";
import { makeAuth } from "./auth.js";
import { createTransactionsRouter } from "./routes/transactions.js";
import { createQueueRouter } from "./routes/queue.js";
import { createExecuteRouter } from "./routes/execute.js";
import { createRequestsRouter } from "./routes/requests.js";
import { createPortfolioRouter } from "./routes/portfolio.js";
import { createStatusRouter } from "./routes/status.js";
import { createSettingsRouter } from "./routes/settings.js";
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
import { createTelegramRouter } from "./routes/telegram.js";
import { startSafeSyncWorker } from "./workers/safeSync.js";
import { startScreeningReconciler } from "./lib/runtime/screening.js";
import { startJobSweeper } from "./lib/runtime/jobs.js";
import { assertSponsorGas } from "./lib/chain/sponsor.js";
import { editNotification } from "./notify.js";
import { assertOwnsTx, requireCallerSafe } from "./lib/authz.js";
import { getUserDetails } from "./lib/supabase/index.js";
import { getPortfolioForAddress } from "./lib/zerion.js";
import { getLinkBySafe } from "./lib/telegram/binding.js";
import { buildAuthRequiredEnvelope, issueLinkCode, relinkRelayText } from "./lib/telegram/linking.js";
import { classifyTelegramCaller, telegramMetaFromBody } from "./lib/telegram/gate.js";
import { runtimeLiveness } from "./lib/runtime/liveness.js";

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

// Principal resolution + the Telegram enrollment gate live in auth.ts (the
// #134 gate test drives the middleware over every MCP-exposed route).
const auth = makeAuth({ agentSecret: AGENT_SECRET, devOpen: DEV_OPEN });

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
app.use("/settings", auth, createSettingsRouter()); // #144 policy-change proposals
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
app.use("/telegram", auth, createTelegramRouter()); // #134 — link preview/complete/unlink

app.post("/notify-resolve", auth, async (req, res) => {
  const { txId, action, txHash } = req.body ?? {};
  if (!txId || !action) {
    res.status(400).json({ error: "Missing txId or action" });
    return;
  }
  // Ownership, not chat-id indirection: the caller may only resolve THEIR
  // transaction's message; the stored notification row knows its own chat.
  const tx = await assertOwnsTx(req, res, String(txId));
  if (!tx) return;

  let message: string;
  if (action === "approved") {
    message = `✅ Approved — ${txId}`;
    if (txHash) message += `\nTX: https://bscscan.com/tx/${txHash}`;
  } else if (action === "rejected") {
    message = `❌ Rejected — ${txId}`;
  } else {
    message = `${action} — ${txId}`;
  }

  editNotification(String(txId), message);
  res.json({ ok: true });
});

// POST /bot-start — the mandatory first tool call for ANY message from an
// unverified chat session (#134 §2). For an unlinked caller this never
// reaches the handler: the auth gate answers with the `auth_required`
// envelope (issuing the link code from the metadata in this body). Reaching
// here means the caller is linked; return greeting material — or, on an
// explicit link/relink intent, a fresh verification link for re-pointing.
app.post("/bot-start", auth, async (req, res) => {
  const safe = requireCallerSafe(req, res);
  if (!safe) return;
  try {
    const [user, link] = await Promise.all([getUserDetails(safe), getLinkBySafe(safe)]);

    if (req.body?.requestLink === true) {
      // Consented relink entry point (#134 §6): same issuance, TTL, idempotency
      // and rate limits as enrollment — only the framing differs.
      const caller = classifyTelegramCaller(req.callerId);
      if (caller.kind !== "valid") {
        res.status(403).json({ error: "Invalid caller identity" });
        return;
      }
      const issued = await issueLinkCode({
        telegramUserId: caller.telegramUserId,
        ...telegramMetaFromBody(req.body, caller.telegramUserId),
      });
      if ("rateLimited" in issued) {
        res.status(429).json({ error: "rate_limited", retry_after: issued.retryAfterSeconds });
        return;
      }
      const envelope = buildAuthRequiredEnvelope(issued.code, issued.expiresAt, issued.userCode);
      res.json({
        ok: true,
        linked: true,
        relink: {
          verification_uri: envelope.verification_uri,
          user_code: envelope.user_code,
          expires_in: envelope.expires_in,
          relay: relinkRelayText(
            envelope.verification_uri,
            envelope.expires_in,
            issued.userCode,
            user?.username ?? null
          ),
        },
      });
      return;
    }

    res.json({
      ok: true,
      linked: true,
      safeAddress: safe,
      name: user?.name ?? null,
      username: user?.username ?? link?.telegram_username ?? null,
    });
  } catch (err) {
    console.error("bot-start failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// GET /me — the caller's own profile (agent passes callerId; the gate
// guarantees only linked callers reach this, so no account data leaks).
app.get("/me", auth, async (req, res) => {
  const safe = requireCallerSafe(req, res);
  if (!safe) return;
  try {
    const user = await getUserDetails(safe);
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

// GET /me/portfolio — the caller's own Safe portfolio (#142). The public
// /portfolio route is address-keyed for the client; this one resolves the
// address from the verified principal so the agent never handles addresses.
app.get("/me/portfolio", auth, async (req, res) => {
  const safe = requireCallerSafe(req, res);
  if (!safe) return;
  try {
    const portfolio = await getPortfolioForAddress(safe);
    res.json(portfolio);
  } catch (err) {
    console.error("GET /me/portfolio failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/health", (_req, res) => {
  // `runtime` is the public liveness signal (#136.5) — the login page's
  // agent badge and any status surface must reflect THIS, never a hardcoded
  // "online". Boolean only; no operational detail leaks on a public route.
  res.json({ ok: true, runtime: runtimeLiveness().online ? "online" : "offline" });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`Zhentan server listening on http://localhost:${port}`);
  startScreeningReconciler();
  startJobSweeper();
  startSafeSyncWorker();
  // Surface a low sponsor gas balance at boot rather than on the first execute.
  if (process.env.SPONSOR_PRIVATE_KEY || process.env.AGENT_PRIVATE_KEY) {
    assertSponsorGas().catch((err) => console.error("Startup gas check failed:", err));
  }
  if (process.env.AGENT_PRIVATE_KEY && process.env.NODE_ENV === "production") {
    console.error(
      "SECURITY: AGENT_PRIVATE_KEY is set in the BACKEND environment. Since D4 the " +
        "agent key belongs to the runtime only — remove it from server/.env."
    );
  }
});
