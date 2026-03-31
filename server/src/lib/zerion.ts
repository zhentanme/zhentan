import { formatUnits, zeroAddress } from "viem";
import { getTokenFallback } from "./token-fallbacks.js";

const ZERION_API_KEY = process.env.ZERION_API_KEY;
const BASE_URL = "https://api.zerion.io/v1";

/** Zerion chain id strings -> numeric chainId (we only care about BNB = 56) */
const CHAIN_ID_BY_ZERION_ID: Record<string, number> = {
  binance_smart_chain: 56,
  "binance-smart-chain": 56,
  bsc: 56,
};

const BNB_CHAIN_ID = 56;

export interface TokenPosition {
  id: string;
  tokenId?: string;
  name: string;
  symbol: string;
  decimals: number;
  iconUrl?: string;
  usdValue: number | null;
  balance: string;
  price: number;
  address: string | null;
  chain: { id: string; chainId: number; name: string };
  verified: boolean;
}

export interface PortfolioResponse {
  tokens: TokenPosition[];
  totalUsd: number;
  /** 24h portfolio % change (from Zerion), null if unavailable */
  percentChange24h: number | null;
}

function getChainId(zerionChainId: string): number | undefined {
  return CHAIN_ID_BY_ZERION_ID[zerionChainId];
}

export async function fetchTokenPositions(
  address: string,
  pageSize = 100,
  maxRetries = 3
): Promise<{ tokens: TokenPosition[] }> {
  if (!ZERION_API_KEY) {
    console.warn("ZERION_API_KEY not set; portfolio will be empty");
    return { tokens: [] };
  }

  const params = new URLSearchParams({
    currency: "usd",
    "filter[positions]": "no_filter",
    "filter[trash]": "only_non_trash",
    sort: "value",
    "page[size]": pageSize.toString(),
  });

  const url = `${BASE_URL}/wallets/${address}/positions/?${params}`;
  const options: RequestInit = {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Basic ${ZERION_API_KEY}`,
    },
  };

  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      const data: unknown[] = json?.data ?? [];

      const walletPositions = data.filter((p: unknown) => {
        const a = (p as { attributes?: { position_type?: string; flags?: { displayable?: boolean }; fungible_info?: unknown } })?.attributes;
        return a?.position_type === "wallet" && a?.flags?.displayable && a?.fungible_info;
      });

      const tokens: TokenPosition[] = [];
      for (const position of walletPositions) {
        const pos = position as {
          id?: string;
          attributes: Record<string, unknown>;
          relationships?: { chain?: { data?: { id?: string } }; fungible?: { data?: { id?: string } } };
        };
        const attrs = pos.attributes;
        const rel = pos.relationships;
        const chainIdStr = rel?.chain?.data?.id ?? "";
        const chainId = getChainId(chainIdStr);
        if (chainId !== BNB_CHAIN_ID) continue;

        const fungibleInfo = attrs.fungible_info as {
          name: string;
          symbol: string;
          icon?: { url?: string };
          implementations?: { chain_id: string; address?: string; decimals?: number }[];
          flags?: { verified?: boolean };
        };
        const quantity = attrs.quantity as { int: string; decimals: number };
        const impl = fungibleInfo?.implementations?.find((i) => i.chain_id === chainIdStr);
        const tokenAddress = impl?.address ?? zeroAddress;
        const needsFallback = !fungibleInfo?.name || !fungibleInfo?.symbol || !fungibleInfo?.icon?.url;
        const fallback = needsFallback ? getTokenFallback(tokenAddress) : undefined;

        tokens.push({
          id: pos.id ?? "",
          tokenId: rel?.fungible?.data?.id,
          name: fungibleInfo?.name || fallback?.name || "Unknown",
          symbol: fungibleInfo?.symbol || fallback?.symbol || "?",
          decimals: quantity?.decimals ?? impl?.decimals ?? 18,
          iconUrl: fungibleInfo?.icon?.url || fallback?.iconUrl,
          usdValue: (attrs.value as number) ?? null,
          balance: formatUnits(BigInt(quantity?.int ?? "0"), quantity?.decimals ?? 18),
          price: (attrs.price as number) ?? 0,
          address: tokenAddress,
          chain: { id: chainIdStr, chainId, name: "BNB Chain" },
          verified: fungibleInfo?.flags?.verified ?? false,
        });
      }

      return { tokens };
    } catch (err) {
      console.error(`Zerion positions attempt ${attempt + 1}/${maxRetries}:`, err);
      attempt++;
      if (attempt === maxRetries) {
        return { tokens: [] };
      }
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  return { tokens: [] };
}

async function fetchWalletPortfolioChange(
  address: string,
  maxRetries = 2
): Promise<number | null> {
  if (!ZERION_API_KEY) return null;
  const url = `${BASE_URL}/wallets/${address}/portfolio?${new URLSearchParams({ currency: "usd", "filter[positions]": "no_filter" })}`;
  const options: RequestInit = {
    method: "GET",
    headers: { accept: "application/json", authorization: `Basic ${ZERION_API_KEY}` },
  };
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const percent = data?.data?.attributes?.changes?.percent_1d;
      return typeof percent === "number" ? percent : null;
    } catch {
      if (attempt === maxRetries - 1) return null;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return null;
}

export interface TokenDetails {
  tokenId: string;
  name: string;
  symbol: string;
  description: string | null;
  iconUrl: string | null;
  verified: boolean;
  externalLinks: { type: string; name: string; url: string }[];
  marketData?: {
    totalSupply: number | null;
    circulatingSupply: number | null;
    marketCap: number | null;
    fullyDilutedValuation: number | null;
    price: number | null;
    changes: {
      percent1d: number | null;
      percent30d: number | null;
      percent90d: number | null;
      percent365d: number | null;
    };
  };
}

export interface TokenChartPoint {
  timestamp: number;
  price: number;
}

export interface TokenChartData {
  beginAt: string;
  endAt: string;
  stats: { first: number; min: number; avg: number; max: number; last: number };
  points: TokenChartPoint[];
}

export type ChartPeriod = "day" | "week" | "month" | "year" | "max";

export async function fetchTokenDetails(
  tokenId: string,
  currency = "usd",
  maxRetries = 3
): Promise<TokenDetails | null> {
  if (!ZERION_API_KEY) return null;
  const url = `${BASE_URL}/fungibles/${tokenId}?${new URLSearchParams({ currency })}`;
  const options: RequestInit = {
    headers: { accept: "application/json", authorization: `Basic ${ZERION_API_KEY}` },
  };
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.data?.attributes) return null;
      const { id, attributes: a } = data.data;
      return {
        tokenId: id,
        name: a.name,
        symbol: a.symbol,
        description: a.description ?? null,
        iconUrl: a.icon?.url ?? null,
        verified: a.flags?.verified ?? false,
        externalLinks: (a.external_links ?? []).map((l: { type: string; name: string; url: string }) => ({
          type: l.type, name: l.name, url: l.url,
        })),
        marketData: a.market_data ? {
          totalSupply: a.market_data.total_supply ?? null,
          circulatingSupply: a.market_data.circulating_supply ?? null,
          marketCap: a.market_data.market_cap ?? null,
          fullyDilutedValuation: a.market_data.fully_diluted_valuation ?? null,
          price: a.market_data.price ?? null,
          changes: {
            percent1d: a.market_data.changes?.percent_1d ?? null,
            percent30d: a.market_data.changes?.percent_30d ?? null,
            percent90d: a.market_data.changes?.percent_90d ?? null,
            percent365d: a.market_data.changes?.percent_365d ?? null,
          },
        } : undefined,
      };
    } catch (err) {
      if (attempt === maxRetries - 1) { console.error("fetchTokenDetails failed:", err); return null; }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return null;
}

async function fetchSinglePeriodChart(
  tokenId: string,
  period: ChartPeriod,
  currency: string,
  options: RequestInit
): Promise<TokenChartData | null> {
  const url = `${BASE_URL}/fungibles/${tokenId}/charts/${period}?${new URLSearchParams({ currency })}`;
  try {
    const res = await fetch(url, options);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.data?.attributes) return null;
    const a = data.data.attributes;
    return {
      beginAt: a.begin_at,
      endAt: a.end_at,
      stats: { first: a.stats.first, min: a.stats.min, avg: a.stats.avg, max: a.stats.max, last: a.stats.last },
      points: (a.points as [number, number][]).map(([timestamp, price]) => ({ timestamp, price })),
    };
  } catch {
    return null;
  }
}

export async function fetchTokenChartData(
  tokenId: string,
  currency = "usd"
): Promise<Record<ChartPeriod, TokenChartData | null>> {
  if (!ZERION_API_KEY) return { day: null, week: null, month: null, year: null, max: null };
  const options: RequestInit = {
    headers: { accept: "application/json", authorization: `Basic ${ZERION_API_KEY}` },
  };
  const periods: ChartPeriod[] = ["day", "week", "month", "year", "max"];
  const results = await Promise.all(
    periods.map((p) => fetchSinglePeriodChart(tokenId, p, currency, options))
  );
  return Object.fromEntries(periods.map((p, i) => [p, results[i]])) as Record<ChartPeriod, TokenChartData | null>;
}

export async function getPortfolioForAddress(address: string): Promise<PortfolioResponse> {
  const [positionsResult, percentChange24h] = await Promise.all([
    fetchTokenPositions(address, 100),
    fetchWalletPortfolioChange(address),
  ]);
  const { tokens } = positionsResult;
  const totalUsd = tokens.reduce((sum, t) => sum + (t.usdValue ?? 0), 0);
  return { tokens, totalUsd, percentChange24h };
}
