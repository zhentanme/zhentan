"use client";

import { apiFetch } from "./api/client";
import type { TransactionWithStatus } from "@/types";

/**
 * Polls the backend until the agent resolves a screened proposal —
 * returns the tx hash on execution, throws on rejection or timeout.
 * Shared by the WalletConnect and Swap flows (screening-on path).
 *
 * Polls the SINGLE-tx endpoint, not the list: the list read reconciles every
 * unresolved row against the Safe Transaction Service, so a 3s list poll
 * multiplies into rate-limit-burning service calls. The single read is a
 * plain DB fetch; external (Safe-app) executions still fold in via the
 * safeSync worker within its 60s sweep.
 */
export async function pollForExecution(
  txId: string,
  _safeAddress: string,
  identityToken: string | null
): Promise<string> {
  const maxAttempts = 60; // ~3 minutes at 3s intervals
  const interval = 3000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const res = await apiFetch(`/transactions/${encodeURIComponent(txId)}`, identityToken);
      if (!res.ok) continue;
      const data = (await res.json()) as { transaction?: TransactionWithStatus };
      const tx = data.transaction;
      if (tx?.txHash) return tx.txHash;
      if (tx?.rejected) throw new Error(tx.rejectReason || "Transaction rejected by agent");
    } catch (err) {
      if (err instanceof Error && err.message.includes("rejected")) throw err;
    }
  }
  throw new Error("Transaction execution timed out");
}
