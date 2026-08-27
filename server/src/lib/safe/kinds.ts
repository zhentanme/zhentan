/**
 * Settlement-kind registry (#142) — the DERIVATIONS pattern applied to the
 * request pipeline. Everything the server pipeline needs to take a kind from
 * raw request body to draft SafeTx lives in ONE entry: field validation,
 * request-time scoring inputs, draft gating, calldata building, finalization
 * staleness, persisted/display fields, and a read-only outcome preview.
 * requests.ts, agentPropose.ts, and finalizeDraft.ts dispatch generically
 * through this registry and never branch on a kind literal.
 *
 * Adding a kind = one entry here + (deliberately) a decoder case in kind.ts
 * and a scoring branch in screening/risk.ts. The screening core stays a
 * closed, explicitly-reviewed set — the registry removes the server-pipeline
 * shotgun, not the screening review.
 */
import { parseUnits, formatUnits } from "viem";

import {
  KIND_BUILDERS,
  resolveTokenBySymbol,
  fetchServerSwapQuote,
  type BuiltCalls,
} from "./builders.js";
import { NATIVE_TOKEN_ADDRESS } from "../constants.js";
import { fetchTokenPositions } from "../zerion.js";
import { findFallbackAddressBySymbol } from "../token-fallbacks.js";
import type { DecodedKind } from "./kind.js";
import type { QueuedRequest, RequestKind } from "../../types.js";

export interface KindContext {
  safeAddress: string;
}

export type ParseResult<P> = { ok: true; params: P } | { ok: false; error: string };

/**
 * Read-only outcome preview: what would happen if this request were queued
 * and executed, in a shape the agent can summarise for the user. Never
 * queues, builds drafts, or writes anything.
 */
export interface KindQuote {
  ok: boolean;
  /** One-line human-readable outcome, ready to relay. */
  summary: string;
  warnings: string[];
  detail: Record<string, unknown>;
}

export interface KindDefinition<P> {
  kind: RequestKind;
  /** Invoices settle only as transfers — kinds that refuse invoice metadata. */
  allowsInvoiceMeta: boolean;
  /**
   * Which user threshold gates draft creation: "approve" (strict — riskier
   * requests fall back to the client's own propose flow) or "block" (lenient
   * — used when the client has no fallback builder for this kind).
   */
  draftBand: "approve" | "block";
  /**
   * True when queue-time calldata goes stale before signing (e.g. a swap
   * quote's min-out). Stale kinds are rebuilt fresh at finalization and
   * their REVIEW-band drafts stay lazy (never park a nonce).
   */
  staleCalldata: boolean;
  /** Validate raw request-body fields into typed build params. */
  parse(body: Record<string, unknown>): ParseResult<P>;
  /** Synthetic PendingTransaction fields for the request-time risk engine. */
  scoringView(params: P): { to: string; amount: string; token: string };
  /**
   * Synthetic DecodedKind for request-time scoring (no calldata exists yet).
   * MUST match what buildCalls produces by construction — the engine scores
   * the request as if it were the eventual transaction.
   */
  syntheticDecoded(params: P): DecodedKind | undefined;
  /** Build the on-chain calls. Null → can't build; request queues draft-less. */
  buildCalls(params: P, ctx: KindContext): Promise<BuiltCalls | null>;
  /** Kind-specific fields persisted on the queued request row. */
  requestFields(params: P): Partial<QueuedRequest>;
  /** Display fields when no draft was built (draft display wins otherwise). */
  displayFallback(params: P): { to: string; token: string };
  /** Re-derive build params from a stored request row (finalization rebuild). */
  paramsFromRequest(row: QueuedRequest): P | null;
  /** Preview the outcome without queueing anything. */
  quote(params: P, ctx: KindContext): Promise<KindQuote>;
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const AMOUNT_RE = /^\d+(\.\d+)?$/;

function asAmount(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return AMOUNT_RE.test(s) && Number(s) > 0 ? s : null;
}

/** Balance lookup by symbol from the Safe's live holdings (native BNB included). */
async function findHolding(
  safeAddress: string,
  symbol: string
): Promise<{ balance: string; decimals: number; price: number; address: string | null } | null> {
  try {
    const { tokens } = await fetchTokenPositions(safeAddress);
    const t = tokens.find((x) => x.symbol?.toUpperCase() === symbol.toUpperCase());
    if (t) return { balance: t.balance, decimals: t.decimals, price: t.price, address: t.address };
  } catch {
    /* fall through */
  }
  return null;
}

/** Exact sufficiency check in base units; false on unparseable inputs. */
function hasSufficientBalance(amount: string, balance: string, decimals: number): boolean {
  try {
    return parseUnits(amount, decimals) <= parseUnits(balance, decimals);
  } catch {
    return false;
  }
}

// ─── transfer ────────────────────────────────────────────────────────────────

export interface TransferParams {
  to: string;
  amount: string;
  token: string;
}

const transferKind: KindDefinition<TransferParams> = {
  kind: "transfer",
  allowsInvoiceMeta: true,
  draftBand: "approve",
  staleCalldata: false,

  parse(body) {
    const { to, amount, token } = body;
    if (!to || !amount || !token) {
      return { ok: false, error: "Missing required fields: to, amount, token" };
    }
    if (typeof to !== "string" || !ADDRESS_RE.test(to)) {
      return { ok: false, error: "to must be a 0x… wallet address" };
    }
    const amt = asAmount(amount);
    if (!amt) return { ok: false, error: "amount must be a positive decimal string" };
    return { ok: true, params: { to, amount: amt, token: String(token) } };
  },

  scoringView: (p) => ({ to: p.to, amount: p.amount, token: p.token }),

  // No synthetic decoded: a request-time transfer scores on the recipient
  // trust profile, exactly as before the registry.
  syntheticDecoded: () => undefined,

  buildCalls: (p, ctx) =>
    KIND_BUILDERS.transfer({ safeAddress: ctx.safeAddress, to: p.to, amount: p.amount, token: p.token }),

  requestFields: () => ({}),

  displayFallback: (p) => ({ to: p.to, token: p.token }),

  paramsFromRequest: (row) =>
    row.to && row.amount && row.token ? { to: row.to, amount: row.amount, token: row.token } : null,

  async quote(p, ctx) {
    const isNative = p.token.toUpperCase() === "BNB";
    const holding = await findHolding(ctx.safeAddress, p.token);
    if (!holding && !isNative) {
      return {
        ok: false,
        summary: `Cannot send ${p.amount} ${p.token}: the wallet does not hold ${p.token}.`,
        warnings: [],
        detail: { token: p.token, held: false },
      };
    }
    const balance = holding?.balance ?? "0";
    const decimals = holding?.decimals ?? 18;
    const sufficient = hasSufficientBalance(p.amount, balance, decimals);
    const estimatedUsd = holding ? Number(p.amount) * holding.price : null;
    const warnings = sufficient
      ? []
      : [`Insufficient balance: holds ${balance} ${p.token}, sending ${p.amount}.`];
    return {
      ok: sufficient,
      summary:
        `Send ${p.amount} ${p.token}` +
        (estimatedUsd != null ? ` (~$${estimatedUsd.toFixed(2)})` : "") +
        ` to ${p.to} — balance ${balance} ${p.token}${sufficient ? "" : " (INSUFFICIENT)"}.`,
      warnings,
      detail: {
        to: p.to,
        amount: p.amount,
        token: p.token,
        tokenAddress: holding?.address ?? (isNative ? NATIVE_TOKEN_ADDRESS : null),
        balance,
        sufficient,
        estimatedUsd,
      },
    };
  },
};

// ─── swap ────────────────────────────────────────────────────────────────────

export interface SwapParams {
  fromToken: string;
  toToken: string;
  sellAmount: string;
  slippage?: number;
}

const swapKind: KindDefinition<SwapParams> = {
  kind: "swap",
  allowsInvoiceMeta: false,
  // The client has no swap builder to fall back to — draft anything below
  // BLOCK; the user still explicitly signs.
  draftBand: "block",
  staleCalldata: true,

  parse(body) {
    const { fromToken, toToken, amount, slippage } = body;
    if (!fromToken || !toToken || !amount) {
      return { ok: false, error: "Swap requests require fromToken, toToken, amount (sell amount)" };
    }
    const amt = asAmount(amount);
    if (!amt) return { ok: false, error: "amount must be a positive decimal string" };
    let slip: number | undefined;
    if (slippage != null) {
      slip = Number(slippage);
      if (!Number.isFinite(slip) || slip <= 0 || slip > 0.5) {
        return { ok: false, error: "slippage must be a fraction in (0, 0.5], e.g. 0.005 = 0.5%" };
      }
    }
    return {
      ok: true,
      params: { fromToken: String(fromToken), toToken: String(toToken), sellAmount: amt, slippage: slip },
    };
  },

  scoringView: (p) => ({ to: "", amount: p.sellAmount, token: p.fromToken }),

  // Matches what buildCalls produces by construction: a known router (LI.FI
  // first, PancakeSwap fallback) and an exact-amount approval — so only the
  // amount/velocity/time factors contribute.
  syntheticDecoded: () => ({
    kind: "swap",
    router: "",
    routerName: "LI.FI / PancakeSwap",
    sellTokenAddress: null,
    sellAmountWei: 0n,
    approval: null,
  }),

  buildCalls: (p, ctx) =>
    KIND_BUILDERS.swap({
      safeAddress: ctx.safeAddress,
      fromToken: p.fromToken,
      toToken: p.toToken,
      sellAmount: p.sellAmount,
      slippage: p.slippage,
    }),

  requestFields: (p) => ({
    fromToken: p.fromToken,
    toToken: p.toToken,
    ...(p.slippage != null && { slippage: p.slippage }),
  }),

  displayFallback: (p) => ({
    to: "",
    token: `${p.fromToken.toUpperCase()} → ${p.toToken.toUpperCase()}`,
  }),

  paramsFromRequest: (row) =>
    row.fromToken && row.toToken && row.amount
      ? { fromToken: row.fromToken, toToken: row.toToken, sellAmount: row.amount, slippage: row.slippage }
      : null,

  async quote(p, ctx) {
    const [from, toHeld] = await Promise.all([
      resolveTokenBySymbol(ctx.safeAddress, p.fromToken),
      resolveTokenBySymbol(ctx.safeAddress, p.toToken),
    ]);
    if (!from) {
      return {
        ok: false,
        summary: `Cannot swap ${p.fromToken}: the wallet does not hold it.`,
        warnings: [],
        detail: { fromToken: p.fromToken, held: false },
      };
    }
    const toAddress = toHeld?.address ?? findFallbackAddressBySymbol(p.toToken);
    if (!toAddress) {
      return {
        ok: false,
        summary: `Cannot resolve "${p.toToken}" to a known BNB Chain token — provide its contract address or use token search.`,
        warnings: [],
        detail: { toToken: p.toToken, resolved: false },
      };
    }

    const warnings: string[] = [];
    const holding = await findHolding(ctx.safeAddress, p.fromToken);
    const sufficient = holding
      ? hasSufficientBalance(p.sellAmount, holding.balance, holding.decimals)
      : false;
    if (!sufficient) {
      warnings.push(
        `Insufficient balance: holds ${holding?.balance ?? "0"} ${p.fromToken}, selling ${p.sellAmount}.`
      );
    }

    const result = await fetchServerSwapQuote({
      fromTokenAddress: from.address,
      toTokenAddress: toAddress,
      amountWei: parseUnits(p.sellAmount, from.decimals),
      safeAddress: ctx.safeAddress,
      slippage: p.slippage,
    });
    if (!result) {
      return {
        ok: false,
        summary: `No swap route found for ${p.fromToken} → ${p.toToken}.`,
        warnings,
        detail: { fromToken: p.fromToken, toToken: p.toToken, route: null },
      };
    }

    // Buy-side decimals are only trusted when the token is already held —
    // otherwise report the USD value and leave the raw amount unformatted.
    const buyAmount =
      toHeld != null && result.quote.buyAmount
        ? formatUnits(BigInt(result.quote.buyAmount), toHeld.decimals)
        : null;
    if (result.slippage > 0.05) {
      warnings.push(
        `Low-liquidity route: slippage escalated to ${(result.slippage * 100).toFixed(0)}%.`
      );
    }
    const buyLabel = buyAmount
      ? `~${buyAmount} ${p.toToken.toUpperCase()}`
      : `~$${result.quote.buyAmountUSD} of ${p.toToken.toUpperCase()}`;
    return {
      ok: sufficient,
      summary:
        `Swap ${p.sellAmount} ${p.fromToken.toUpperCase()} (~$${result.quote.sellAmountUSD})` +
        ` → ${buyLabel} (~$${result.quote.buyAmountUSD}) via ${result.quote.tool?.name ?? "DEX"}` +
        `${sufficient ? "" : " — INSUFFICIENT BALANCE"}.`,
      warnings,
      detail: {
        fromToken: p.fromToken,
        toToken: p.toToken,
        sellAmount: p.sellAmount,
        sellAmountUSD: result.quote.sellAmountUSD,
        buyAmount,
        buyAmountBaseUnits: result.quote.buyAmount,
        buyAmountUSD: result.quote.buyAmountUSD,
        route: result.quote.tool?.name ?? null,
        slippage: result.slippage,
        balance: holding?.balance ?? "0",
        sufficient,
      },
    };
  },
};

// ─── registry ────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export const KINDS: Record<RequestKind, KindDefinition<any>> = {
  transfer: transferKind,
  swap: swapKind,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export const VALID_KINDS = Object.keys(KINDS) as RequestKind[];

export function getKind(kind: unknown): KindDefinition<unknown> | null {
  if (kind === undefined) return KINDS.transfer;
  return typeof kind === "string" && kind in KINDS ? KINDS[kind as RequestKind] : null;
}
