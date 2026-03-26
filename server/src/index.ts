import "dotenv/config";
import cors from "cors";
import express from "express";
import { createTransactionsRouter } from "./routes/transactions.js";
import { createQueueRouter } from "./routes/queue.js";
import { createExecuteRouter } from "./routes/execute.js";
import { createInvoicesRouter } from "./routes/invoices.js";
import { createPortfolioRouter } from "./routes/portfolio.js";
import { createStatusRouter, getTelegramChatIdForSafe } from "./routes/status.js";
import { createResolveRouter } from "./routes/resolve.js";
import { createRulesRouter } from "./routes/rules.js";
import { createEventsRouter } from "./routes/events.js";
import { editNotification } from "./notify.js";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());

app.use("/transactions", createTransactionsRouter());
app.use("/queue", createQueueRouter());
app.use("/execute", createExecuteRouter());
app.use("/invoices", createInvoicesRouter());
app.use("/portfolio", createPortfolioRouter());
app.use("/status", createStatusRouter());
app.use("/rules", createRulesRouter());
app.use("/events", createEventsRouter());
app.use("/resolve", createResolveRouter());

app.post("/notify-resolve", async (req, res) => {
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
