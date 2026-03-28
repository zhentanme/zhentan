import type { ApiFetchFn } from "./client";
import type { PortfolioResponse } from "@/types";

export function portfolioApi(req: ApiFetchFn) {
  return {
    async get(safeAddress: string): Promise<PortfolioResponse> {
      const res = await req(`/portfolio?safeAddress=${encodeURIComponent(safeAddress)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  };
}
