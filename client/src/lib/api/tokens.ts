import type { ApiFetchFn } from "./client";
import type { TokenDetails, TokenChartData, ChartPeriod } from "@/types";

export interface TokenDetailsResponse {
  tokenDetails: TokenDetails;
  tokenChartData: Record<ChartPeriod, TokenChartData | null>;
}

export interface SearchedToken {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  iconUrl: string | null;
  address: string | null;
}

export function tokensApi(req: ApiFetchFn) {
  return {
    async getDetails(tokenId: string, currency = "usd"): Promise<TokenDetailsResponse> {
      const res = await req(`/tokens/details/${encodeURIComponent(tokenId)}?currency=${currency}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    async search(q: string): Promise<SearchedToken[]> {
      const res = await req(`/tokens/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.tokens ?? [];
    },
  };
}
