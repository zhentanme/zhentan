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

// ---------------------------------------------------------------------------
// Transfer history
// ---------------------------------------------------------------------------

const BSC_CHAIN = "binance-smart-chain";
const SYSTEM_ADDRESSES = new Set([
  "0xd8baa107006c93a030d1455a2ef43261b384f21c", // Pimlico paymaster
  "0x0000000071727de22e5e9d8baf0edac6f37da032", // ERC-4337 EntryPoint
]);

/** Operations where the net effect is the user receiving value */
const RECEIVE_OPS = new Set(["receive", "withdraw", "borrow", "mint"]);

// ── Public types ──────────────────────────────────────────────────────────────

/** A single token involved in a transfer */
export interface ZerionToken {
  symbol: string;
  name: string;
  /** BSC contract address; empty string for native BNB */
  address: string;
  iconUrl: string | null;
  verified: boolean;
}

/** One side of a token movement within a transaction */
export interface ZerionTransfer {
  direction: "in" | "out" | "self";
  token: ZerionToken;
  /** Formatted human-readable amount */
  amount: string;
  valueUSD: number | null;
  price: number | null;
  sender: string;
  recipient: string;
}

/**
 * Normalised on-chain transaction item.
 *
 * Reading rules:
 *   send / deposit / repay / burn  → user sent `token` `amount`
 *   receive / withdraw / borrow    → user received `token` `amount`
 *   trade                          → user sold `token` `amount`, got back `received`
 *   execute                        → contract call, token fields are empty
 */
export interface ZerionHistoryItem {
  hash: string;
  timestamp: string;
  /** Zerion operation_type: send | receive | trade | approve | execute | deposit | withdraw | … */
  operationType: string;
  /** Net direction from the user's perspective */
  direction: "send" | "receive";

  // ── Token that moved ─────────────────────────────────────────────────────
  /** The token sent (sends/trade-sold) or received (receives). Empty for pure execute ops. */
  token: ZerionToken;
  /** Formatted human-readable amount */
  amount: string;
  /** USD value of this transfer, null if Zerion doesn't have pricing */
  valueUSD: number | null;

  // ── Counterparty ─────────────────────────────────────────────────────────
  /** Who sent — the wallet address for outgoing ops, the counterparty for incoming */
  from: string;
  /** Who received — the counterparty for outgoing ops, the wallet address for incoming */
  to: string;

  // ── Trade only ───────────────────────────────────────────────────────────
  /** The token bought in exchange (only present for trade operations) */
  received?: {
    token: ZerionToken;
    amount: string;
    valueUSD: number | null;
  };

  /** All individual token movements in this tx, for detail views */
  transfers: ZerionTransfer[];
  /** Zerion spam/dust flag */
  isTrash: boolean;
}

// ── Internal raw types ────────────────────────────────────────────────────────

interface RawImpl {
  chain_id: string;
  address: string;
  decimals: number;
}

interface RawFungibleInfo {
  name?: string;
  symbol?: string;
  icon?: { url?: string } | null;
  flags?: { verified?: boolean };
  implementations?: RawImpl[];
}

interface RawTransfer {
  fungible_info?: RawFungibleInfo;
  direction?: string;
  quantity?: { float?: number };
  value?: number | null;
  price?: number | null;
  sender?: string;
  recipient?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the BSC-specific contract address for a fungible */
function bscAddress(fi?: RawFungibleInfo): string {
  return fi?.implementations?.find((i) => i.chain_id === BSC_CHAIN)?.address ?? "";
}

/** Map a Zerion fungible_info to our ZerionToken shape */
function toToken(fi?: RawFungibleInfo): ZerionToken {
  return {
    symbol: fi?.symbol ?? "?",
    name: fi?.name ?? "",
    address: bscAddress(fi),
    iconUrl: fi?.icon?.url ?? null,
    verified: fi?.flags?.verified ?? false,
  };
}

/**
 * Format a token amount as a plain numeric string (no locale commas).
 * The client's formatTokenAmount will handle final display formatting.
 */
function formatAmount(n: number): string {
  if (n >= 1) return parseFloat(n.toFixed(4)).toString();
  if (n >= 0.0001) return n.toFixed(6).replace(/\.?0+$/, "");
  return n.toPrecision(4);
}

/** Map a raw Zerion transfer entry to our ZerionTransfer shape */
function toTransfer(t: RawTransfer): ZerionTransfer | null {
  if (!t.fungible_info) return null;
  const qty = t.quantity?.float ?? 0;
  return {
    direction: (t.direction ?? "out") as "in" | "out" | "self",
    token: toToken(t.fungible_info),
    amount: qty > 0 ? formatAmount(qty) : "",
    valueUSD: t.value ?? null,
    price: t.price ?? null,
    sender: t.sender ?? "",
    recipient: t.recipient ?? "",
  };
}

/**
 * Pick the first transfer with the given direction, skipping system contracts
 * (EntryPoint, paymaster) as recipients and entries without a token symbol.
 */
function pickDir(
  transfers: ZerionTransfer[],
  dir: "in" | "out" | "self"
): ZerionTransfer | undefined {
  return transfers.find(
    (t) =>
      t.direction === dir &&
      t.token.symbol !== "?" &&
      !SYSTEM_ADDRESSES.has(t.recipient.toLowerCase())
  );
}

// ── Main fetch function ───────────────────────────────────────────────────────

export async function fetchTransfers(
  address: string,
  pageSize = 25,
  maxRetries = 2
): Promise<ZerionHistoryItem[]> {
  if (!ZERION_API_KEY) return [];

  const params = new URLSearchParams({
    currency: "usd",
    "filter[chain_ids]": BSC_CHAIN,   // server-side BSC filter — no need to filter again
    "filter[trash]": "only_non_trash", // skip spam/dust tokens
    "page[size]": pageSize.toString(),
  });
  const url = `${BASE_URL}/wallets/${address}/transactions/?${params}`;
  const options: RequestInit = {
    headers: { accept: "application/json", authorization: `Basic ${ZERION_API_KEY}` },
  };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const items: ZerionHistoryItem[] = [];

      for (const entry of (json?.data ?? []) as unknown[]) {
        const tx = entry as {
          attributes: {
            operation_type?: string;
            hash?: string;
            mined_at?: string;
            sent_from?: string;
            sent_to?: string;
            transfers?: RawTransfer[];
            flags?: { is_trash?: boolean };
          };
        };

        const attrs = tx.attributes;
        const hash = attrs.hash;
        const timestamp = attrs.mined_at;
        if (!hash || !timestamp) continue;

        const operationType = attrs.operation_type ?? "execute";
        const isTrash = attrs.flags?.is_trash ?? false;
        const sentFrom = attrs.sent_from ?? "";
        const sentTo = attrs.sent_to ?? "";

        // Build normalised transfers list, filtering out entries without fungible info
        const transfers: ZerionTransfer[] = (attrs.transfers ?? []).flatMap((t) => {
          const r = toTransfer(t);
          return r ? [r] : [];
        });

        // ── TRADE ────────────────────────────────────────────────────────────
        // token = sold (out), received = bought (in)
        if (operationType === "trade") {
          const sold = pickDir(transfers, "out");
          const bought = pickDir(transfers, "in");
          if (!sold) continue; // can't display without a sold token

          items.push({
            hash, timestamp, operationType, isTrash,
            direction: "send",
            token: sold.token,
            amount: sold.amount,
            valueUSD: sold.valueUSD,
            from: sold.sender || sentFrom,
            to: sold.recipient || sentTo,
            received: bought
              ? { token: bought.token, amount: bought.amount, valueUSD: bought.valueUSD }
              : undefined,
            transfers,
          });
          continue;
        }

        // ── RECEIVE-LIKE (receive | withdraw | borrow | mint) ─────────────────
        // token = what came in
        if (RECEIVE_OPS.has(operationType)) {
          const incoming = pickDir(transfers, "in");
          if (!incoming) continue;

          items.push({
            hash, timestamp, operationType, isTrash,
            direction: "receive",
            token: incoming.token,
            amount: incoming.amount,
            valueUSD: incoming.valueUSD,
            from: incoming.sender || sentFrom,
            to: incoming.recipient || address,
            transfers,
          });
          continue;
        }

        // ── EXECUTE (no token transfers — pure contract call) ─────────────────
        if (operationType === "execute" && transfers.length === 0) {
          items.push({
            hash, timestamp, operationType, isTrash,
            direction: "send",
            token: { symbol: "", name: "", address: "", iconUrl: null, verified: false },
            amount: "",
            valueUSD: null,
            from: sentFrom,
            to: sentTo,
            transfers: [],
          });
          continue;
        }

        // ── SEND / DEPOSIT / REPAY / BURN and everything else ─────────────────
        // token = outgoing; fallback to self-transfer, then incoming
        const outgoing =
          pickDir(transfers, "out") ??
          pickDir(transfers, "self") ??
          pickDir(transfers, "in");

        if (!outgoing) continue;

        items.push({
          hash, timestamp, operationType, isTrash,
          direction: "send",
          token: outgoing.token,
          amount: outgoing.amount,
          valueUSD: outgoing.valueUSD,
          from: outgoing.sender || sentFrom,
          to: outgoing.recipient || sentTo,
          transfers,
        });
      }

      return items;
    } catch (err) {
      if (attempt === maxRetries - 1) {
        console.error("fetchTransfers failed:", err);
        return [];
      }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return [];
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
