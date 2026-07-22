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
      const data = (await res.json()) as ExecuteResult & { status: string; reason?: string };
      // The server can also answer superseded / already_rejected / in_progress —
      // none of which mean "your transaction went through". Callers treat a
      // resolved promise as success, so surface those as errors.
      if (data.status !== "executed" && data.status !== "already_executed") {
        throw new Error(
          data.reason || `Transaction not executed (status: ${data.status})`
        );
      }
      return data;
    },
  };
}
