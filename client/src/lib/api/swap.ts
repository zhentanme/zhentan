import type { ApiFetchFn } from "./client";
import type { SwapQuote } from "@/lib/proposeSwap";

export function swapApi(req: ApiFetchFn) {
  return {
    async getQuote(params: {
      fromToken: string;
      toToken: string;
      amount: string;
      fromAddress: string;
    }): Promise<SwapQuote> {
      const qs = new URLSearchParams(params).toString();
      const res = await req(`/swap?${qs}`);
      const data = await res.json();
      if (!res.ok || !data.status) {
        throw new Error(data.error || "Failed to fetch swap quote");
      }
      return data.quote as SwapQuote;
    },
  };
}
