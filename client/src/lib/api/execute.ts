import type { ApiFetchFn } from "./client";

export interface ExecuteResult {
  status: "executed" | "already_executed";
  txId: string;
  to: string;
  amount: string;
  token: string;
  txHash: string;
  success: boolean;
}

export function executeApi(req: ApiFetchFn) {
  return {
    async run(txId: string): Promise<ExecuteResult> {
      const res = await req("/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  };
}
