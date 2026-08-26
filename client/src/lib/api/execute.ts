import type { ApiFetchFn } from "./client";
import { apiError } from "./client";

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
      if (!res.ok) throw await apiError(res, "Couldn’t execute the transaction");
      const data = (await res.json()) as ExecuteResult & { status: string; reason?: string };
      // The server can also answer superseded / already_rejected / in_progress —
      // none of which mean "your transaction went through". Callers treat a
      // resolved promise as success, so surface those as errors.
      if (data.status !== "executed" && data.status !== "already_executed") {
        throw new Error(
          data.reason ||
            (data.status === "superseded"
              ? "This transaction was replaced by a newer one"
              : data.status === "already_rejected"
                ? "This transaction was already rejected"
                : data.status === "in_progress"
                  ? "This transaction is already executing"
                  : "The transaction didn’t execute")
        );
      }
      return data;
    },
  };
}
