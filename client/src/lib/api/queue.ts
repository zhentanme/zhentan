import type { ApiFetchFn } from "./client";
import type { PendingTransaction } from "@/types";

export interface QueueResult {
  success: boolean;
  id: string;
  risk?: {
    riskScore: number;
    verdict: "APPROVE" | "REVIEW" | "BLOCK";
    reasons: string[];
  };
  autoExecuted?: boolean;
  txHash?: string;
}

export function queueApi(req: ApiFetchFn) {
  return {
    async enqueue(tx: PendingTransaction): Promise<QueueResult> {
      const res = await req("/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tx),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  };
}
