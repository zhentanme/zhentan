import type { ApiFetchFn } from "./client";
import type { SwapQuote } from "@/lib/proposeSwap";

export function swapApi(req: ApiFetchFn) {
  return {
    async getQuote(params: {
      fromToken: string;
      toToken: string;
      amount: string;
      fromAddress: string;
      slippage?: string;
    }): Promise<SwapQuote & { slippage: number }> {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string>
      ).toString();
      const res = await req(`/swap?${qs}`);
      const data = await res.json();
      if (!res.ok || !data.status) {
        throw new Error(data.error || "Failed to fetch swap quote");
      }
      return { ...(data.quote as SwapQuote), slippage: data.slippage ?? 0.05 };
    },
  };
}
