import type { ApiFetchFn } from "./client";
import type { TransactionWithStatus } from "@/types";

export function transactionsApi(req: ApiFetchFn) {
  return {
    async list(safeAddress: string): Promise<{ transactions: TransactionWithStatus[] }> {
      const res = await req(`/transactions?safeAddress=${encodeURIComponent(safeAddress)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    /**
     * Zhentan DB records only — no Zerion on-chain enrichment, so this returns
     * fast. Use for pending-review / recent-decision lists and badge counts
     * where the full activity merge isn't needed.
     */
    async listDb(safeAddress: string): Promise<{ transactions: TransactionWithStatus[] }> {
      const res = await req(`/transactions/db?safeAddress=${encodeURIComponent(safeAddress)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    async get(id: string): Promise<{ transaction: TransactionWithStatus }> {
      const res = await req(`/transactions/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    async update(
      id: string,
      body: { action: "review" | "reject"; reason?: string }
    ): Promise<{ status: string; txId: string }> {
      const res = await req(`/transactions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    /**
     * Complete an agent-proposed (pre-signed, 1-of-2) tx: submit the user's
     * signature over its safeTxHash; the server verifies it, stores it, and the
     * relayer executes. Used by the auto-approve request flow.
     */
    async sign(
      id: string,
      userSignature: string
    ): Promise<{ status: string; txId: string; execution: { status?: string; txHash?: string; error?: string } }> {
      const res = await req(`/transactions/${encodeURIComponent(id)}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userSignature }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  };
}
