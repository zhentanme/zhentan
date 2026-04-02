"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { TokenRow } from "./TokenRow";
import { useAuth } from "@/app/context/AuthContext";
import { ThemeLoaderSpinner } from "./ThemeLoader";
import {
  ArrowDownUp,
  ChevronDown,
  Coins,
  CheckCircle2,
} from "lucide-react";
import { formatTokenAmount, truncateAddress, formatDate } from "@/lib/format";
import { BSC_EXPLORER_URL, NATIVE_TOKEN_ADDRESS } from "@/lib/constants";
import { proposeSwap, type SwapQuote } from "@/lib/proposeSwap";
import { useApiClient } from "@/lib/api/client";
import { parseUnits, formatUnits } from "viem";
import type { TokenPosition } from "@/types";

// Popular BNB Chain tokens shown in the buy token selector even if not in portfolio
const BNB_POPULAR_TOKENS: TokenPosition[] = [
  {
    id: "bnb-native",
    name: "BNB",
    symbol: "BNB",
    decimals: 18,
    iconUrl: "/bsc-yellow.png",
    usdValue: null,
    balance: "0",
    price: 0,
    address: NATIVE_TOKEN_ADDRESS,
    chain: { id: "bsc", chainId: 56, name: "BNB Chain" },
    verified: true,
  },
  {
    id: "usdc-bsc",
    name: "USD Coin",
    symbol: "USDC",
    decimals: 18,
    iconUrl: "https://coin-images.coingecko.com/coins/images/6319/small/usdc.png",
    usdValue: null,
    balance: "0",
    price: 0,
    address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    chain: { id: "bsc", chainId: 56, name: "BNB Chain" },
    verified: true,
  },
  {
    id: "usdt-bsc",
    name: "Tether USD",
    symbol: "USDT",
    decimals: 18,
    iconUrl: "https://coin-images.coingecko.com/coins/images/325/small/Tether.png",
    usdValue: null,
    balance: "0",
    price: 0,
    address: "0x55d398326f99059fF775485246999027B3197955",
    chain: { id: "bsc", chainId: 56, name: "BNB Chain" },
    verified: true,
  },
  {
    id: "wbnb-bsc",
    name: "Wrapped BNB",
    symbol: "WBNB",
    decimals: 18,
    iconUrl: "https://coin-images.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
    usdValue: null,
    balance: "0",
    price: 0,
    address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    chain: { id: "bsc", chainId: 56, name: "BNB Chain" },
    verified: true,
  },
  {
    id: "eth-bsc",
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
    iconUrl: "https://coin-images.coingecko.com/coins/images/279/small/ethereum.png",
    usdValue: null,
    balance: "0",
    price: 0,
    address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
    chain: { id: "bsc", chainId: 56, name: "BNB Chain" },
    verified: true,
  },
  {
    id: "cake-bsc",
    name: "PancakeSwap",
    symbol: "CAKE",
    decimals: 18,
    iconUrl: "https://coin-images.coingecko.com/coins/images/12632/small/pancakeswap-cake-logo.png",
    usdValue: null,
    balance: "0",
    price: 0,
    address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
    chain: { id: "bsc", chainId: 56, name: "BNB Chain" },
    verified: true,
  },
];

interface SwapPanelProps {
  onSuccess: () => void;
  onClose?: () => void;
  tokens: TokenPosition[];
}

type SwapPhase = "form" | "swapping" | "success" | "error";

export function SwapPanel({ onSuccess, onClose, tokens }: SwapPanelProps) {
  const { wallet, safeAddress, getOwnerAccount, identityToken } = useAuth();
  const api = useApiClient();

  const [fromToken, setFromToken] = useState<TokenPosition | null>(null);
  const [toToken, setToToken] = useState<TokenPosition | null>(null);
  const [sellAmount, setSellAmount] = useState("");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SwapPhase>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [executedAt, setExecutedAt] = useState<string | null>(null);
  const [fromSelectorOpen, setFromSelectorOpen] = useState(false);
  const [toSelectorOpen, setToSelectorOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Portfolio tokens that can be sold (have balance)
  const sellableTokens = tokens.filter(
    (t) => t.address != null && parseFloat(t.balance) > 0
  );

  // Buy tokens: merge portfolio + popular, deduplicated by address
  const buyTokens: TokenPosition[] = (() => {
    const portfolioAddresses = new Set(
      tokens.map((t) => t.address?.toLowerCase())
    );
    const extras = BNB_POPULAR_TOKENS.filter(
      (t) => !portfolioAddresses.has(t.address?.toLowerCase())
    );
    // Prefer portfolio tokens (they have real balances)
    return [...tokens.filter((t) => t.address != null), ...extras];
  })();

  // Initialize from token
  useEffect(() => {
    if (!fromToken && sellableTokens.length > 0) {
      setFromToken(sellableTokens[0]);
    }
  }, [tokens]);

  const balanceNum = parseFloat(fromToken?.balance ?? "0") || 0;
  const amountNum = parseFloat(sellAmount) || 0;
  const insufficientFunds = amountNum > 0 && amountNum > balanceNum;

  // Debounced quote fetching
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!fromToken || !toToken || !sellAmount || amountNum <= 0 || !wallet || !safeAddress) {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }

    if (fromToken.address?.toLowerCase() === toToken.address?.toLowerCase()) {
      setQuoteError("Select different tokens");
      setQuote(null);
      return;
    }

    setQuoteLoading(true);
    setQuoteError(null);

    debounceRef.current = setTimeout(async () => {
      try {
        const amountWei = parseUnits(sellAmount, fromToken.decimals).toString();
        const fetchedQuote = await api.swap.getQuote({
          fromToken: fromToken.address ?? NATIVE_TOKEN_ADDRESS,
          toToken: toToken.address ?? NATIVE_TOKEN_ADDRESS,
          amount: amountWei,
          fromAddress: safeAddress,
        });
        setQuote(fetchedQuote);
        setQuoteError(null);
      } catch (err) {
        setQuoteError(err instanceof Error ? err.message : "No route found");
        setQuote(null);
      } finally {
        setQuoteLoading(false);
      }
    }, 700);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fromToken, toToken, sellAmount, wallet]);

  const buyAmountFormatted =
    quote && toToken
      ? parseFloat(formatUnits(BigInt(quote.buyAmount), toToken.decimals)).toFixed(6)
      : "";

  const handleSwapTokens = () => {
    const prev = fromToken;
    setFromToken(toToken && sellableTokens.find((t) => t.address?.toLowerCase() === toToken.address?.toLowerCase()) ? toToken : null);
    setToToken(prev);
    setSellAmount("");
    setQuote(null);
  };

  const handleSubmit = async () => {
    if (!fromToken || !toToken || !quote || !wallet || !sellAmount) return;

    setError(null);
    setLoading(true);
    setPhase("swapping");

    try {
      const pendingTx = await proposeSwap({
        fromToken,
        toToken,
        sellAmount,
        quote,
        ownerAddress: wallet.address,
        getOwnerAccount,
        identityToken,
      });

      const result = await api.execute.run(pendingTx.id);
      setTxHash(result.txHash ?? null);
      setExecutedAt(new Date().toISOString());
      setPhase("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Swap failed");
      setPhase("error");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSellAmount("");
    setQuote(null);
    setQuoteError(null);
    setTxHash(null);
    setExecutedAt(null);
    setError(null);
    setPhase("form");
  };

  // Swapping phase
  if (phase === "swapping") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-4">
          <ThemeLoaderSpinner variant="transaction" />
          <p className="text-sm font-semibold text-gold">Processing swap</p>
          <p className="text-xs text-slate-500 uppercase tracking-widest">Executing on chain</p>
        </div>
        <div className="rounded-2xl bg-white/6 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <TokenIcon token={fromToken} />
            <span className="text-base font-semibold text-white">
              {sellAmount} {fromToken?.symbol}
            </span>
          </div>
          <div className="flex items-center pl-1">
            <ArrowDownUp className="h-4 w-4 text-slate-600 ml-3" />
          </div>
          <div className="flex items-center gap-3">
            <TokenIcon token={toToken} />
            <span className="text-base font-semibold text-white">
              ~{parseFloat(buyAmountFormatted).toFixed(4)} {toToken?.symbol}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Success phase
  if (phase === "success") {
    const explorerUrl = txHash ? `${BSC_EXPLORER_URL}/tx/${txHash}` : null;
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-2xl bg-gold/20 text-gold flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <span className="text-sm font-semibold text-gold">Executed</span>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-white/6 p-4">
          <div className="w-10 h-10 rounded-2xl bg-white/8 flex items-center justify-center text-gold shrink-0">
            <ArrowDownUp className="h-5 w-5" />
          </div>
          <TokenIcon token={fromToken} />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold text-white">{sellAmount} {fromToken?.symbol}</p>
            <p className="text-sm text-slate-400">→ ~{parseFloat(buyAmountFormatted).toFixed(4)} {toToken?.symbol}</p>
          </div>
        </div>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between items-center gap-4">
            <dt className="text-slate-500">Via</dt>
            <dd className="flex items-center gap-1.5">
              {quote?.tool?.logoURI && (
                <span className="relative w-4 h-4 rounded-full overflow-hidden bg-white/10 shrink-0">
                  <Image src={quote.tool.logoURI} alt="" width={16} height={16} className="object-cover" unoptimized />
                </span>
              )}
              <span className="text-slate-200">{quote?.tool?.name ?? "LiFi"}</span>
            </dd>
          </div>
          {executedAt && (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Executed</dt>
              <dd className="text-slate-300">{formatDate(executedAt)}</dd>
            </div>
          )}
        </dl>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-2xl py-3 bg-white/8 text-slate-300 hover:text-white hover:bg-white/12 transition-colors text-sm font-medium"
          >
            <span className="relative w-[18px] h-[18px] shrink-0">
              <Image src="/bscscan.png" alt="" fill className="object-contain rounded" sizes="18px" />
            </span>
            View on BSC Explorer
          </a>
        )}
        <Button type="button" onClick={() => { reset(); onSuccess(); }} className="w-full py-3.5">
          Done
        </Button>
      </div>
    );
  }

  // Error phase
  if (phase === "error") {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-2xl bg-red-400/15 text-red-400 flex items-center justify-center">
            <ArrowDownUp className="h-10 w-10" />
          </div>
          <span className="text-sm font-semibold text-red-400">Swap Failed</span>
          {error && <p className="text-xs text-slate-500 text-center">{error}</p>}
        </div>
        <Button type="button" variant="secondary" onClick={reset} className="w-full py-3.5">
          Try Again
        </Button>
        {onClose && (
          <Button type="button" variant="ghost" onClick={onClose} className="w-full py-3">
            Close
          </Button>
        )}
      </div>
    );
  }

  // Form
  return (
    <>
      {/* From token selector dialog */}
      <Dialog
        open={fromSelectorOpen}
        onClose={() => setFromSelectorOpen(false)}
        title="Sell token"
        sheetOnMobile
      >
        <div className="flex items-center gap-2 mb-4">
          <Coins className="h-4 w-4 text-gold" />
          <h2 className="text-sm font-semibold text-white tracking-wide">
            <span className="text-gold">›</span> Your tokens
          </h2>
        </div>
        {sellableTokens.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No tokens with balance</p>
        ) : (
          <div className="space-y-1 -mx-1">
            {sellableTokens.map((t, i) => (
              <TokenRow
                key={t.id}
                token={t}
                index={i}
                selected={fromToken?.id === t.id}
                onClick={() => {
                  setFromToken(t);
                  setSellAmount("");
                  setQuote(null);
                  setFromSelectorOpen(false);
                }}
              />
            ))}
          </div>
        )}
      </Dialog>

      {/* To token selector dialog */}
      <Dialog
        open={toSelectorOpen}
        onClose={() => setToSelectorOpen(false)}
        title="Buy token"
        sheetOnMobile
      >
        <div className="flex items-center gap-2 mb-4">
          <Coins className="h-4 w-4 text-gold" />
          <h2 className="text-sm font-semibold text-white tracking-wide">
            <span className="text-gold">›</span> BNB Chain tokens
          </h2>
        </div>
        <div className="space-y-1 -mx-1">
          {buyTokens.map((t, i) => (
            <TokenRow
              key={t.id}
              token={t}
              index={i}
              selected={toToken?.address?.toLowerCase() === t.address?.toLowerCase()}
              onClick={() => {
                setToToken(t);
                setQuote(null);
                setToSelectorOpen(false);
              }}
            />
          ))}
        </div>
      </Dialog>

      <div className="flex flex-col gap-3">
        {/* Sell row */}
        <div className="rounded-2xl bg-white/6 px-4 pt-3 pb-3">
          <label className="block text-xs font-medium text-slate-500 mb-2">
            You&apos;re selling
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              placeholder="0.00"
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
              className="flex-1 min-w-0 bg-transparent border-0 text-3xl font-semibold text-white placeholder-slate-600 focus:outline-none focus:ring-0 touch-manipulation"
            />
            <button
              type="button"
              onClick={() => setFromSelectorOpen(true)}
              className="flex items-center gap-2 rounded-2xl bg-white/8 hover:bg-white/14 border border-white/8 px-3 py-2 transition-colors cursor-pointer shrink-0"
            >
              <TokenIcon token={fromToken} size="sm" />
              <span className="text-sm font-semibold text-white">
                {fromToken ? fromToken.symbol : "Select"}
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
          </div>
          {fromToken && (
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1">
                {[{ label: "50%", pct: 0.5 }, { label: "75%", pct: 0.75 }, { label: "MAX", pct: 1 }].map(({ label, pct }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      const val = (parseFloat(fromToken.balance) * pct).toFixed(6).replace(/\.?0+$/, "");
                      setSellAmount(val);
                    }}
                    className="px-1.5 py-0.5 rounded text-xs font-semibold text-gold hover:text-gold-light transition-colors cursor-pointer"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                {formatTokenAmount(fromToken.balance)} {fromToken.symbol}
                {fromToken.usdValue != null &&
                  ` · $${fromToken.usdValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </p>
            </div>
          )}
          {insufficientFunds && (
            <p className="text-xs text-red-400 mt-1">Insufficient funds</p>
          )}
        </div>

        {/* Swap direction button */}
        <div className="flex items-center justify-center -my-1">
          <button
            type="button"
            onClick={handleSwapTokens}
            className="w-9 h-9 rounded-full bg-[#0f0f14] border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:border-white/20 transition-colors cursor-pointer z-10"
          >
            <ArrowDownUp className="h-4 w-4" />
          </button>
        </div>

        {/* Buy row */}
        <div className="rounded-2xl bg-white/4 px-4 pt-3 pb-3">
          <label className="block text-xs font-medium text-slate-500 mb-2">
            You&apos;re buying
          </label>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {quoteLoading ? (
                <span className="text-3xl font-semibold text-slate-600 animate-pulse">…</span>
              ) : buyAmountFormatted && toToken ? (
                <span className="text-3xl font-semibold text-white/80">
                  ~{parseFloat(buyAmountFormatted).toFixed(4)}
                </span>
              ) : (
                <span className="text-3xl font-semibold text-slate-600">0.00</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setToSelectorOpen(true)}
              className="flex items-center gap-2 rounded-2xl bg-white/8 hover:bg-white/14 border border-white/8 px-3 py-2 transition-colors cursor-pointer shrink-0"
            >
              <TokenIcon token={toToken} size="sm" />
              <span className="text-sm font-semibold text-white">
                {toToken ? toToken.symbol : "Select"}
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
          </div>
          {quote?.buyAmountUSD && (
            <p className="text-xs text-slate-500 mt-2">
              ≈ ${parseFloat(quote.buyAmountUSD).toFixed(2)}
            </p>
          )}
          {quoteError && (
            <p className="text-xs text-amber-400 mt-2">{quoteError}</p>
          )}
        </div>

        {/* Quote info */}
        {quote && fromToken && toToken && (
          <motion.div
            className="rounded-2xl bg-white/4 border border-white/6 px-4 py-3 space-y-2 text-sm"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Via</span>
              <div className="flex items-center gap-1.5">
                {quote.tool?.logoURI && (
                  <span className="relative w-4 h-4 rounded-full overflow-hidden bg-white/10 shrink-0">
                    <Image src={quote.tool.logoURI} alt="" width={16} height={16} className="object-cover" unoptimized />
                  </span>
                )}
                <span className="text-slate-300">{quote.tool?.name ?? "LiFi"}</span>
              </div>
            </div>
            {quote.sellAmountUSD && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Sell value</span>
                <span className="text-slate-300">${parseFloat(quote.sellAmountUSD).toFixed(2)}</span>
              </div>
            )}
            {quote.buyAmountUSD && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Buy value</span>
                <span className="text-slate-300">${parseFloat(quote.buyAmountUSD).toFixed(2)}</span>
              </div>
            )}
          </motion.div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button
          type="button"
          onClick={handleSubmit}
          loading={loading}
          disabled={
            !fromToken ||
            !toToken ||
            !quote ||
            !sellAmount ||
            amountNum <= 0 ||
            insufficientFunds ||
            !!quoteError ||
            quoteLoading
          }
          className="w-full py-3.5"
        >
          {!fromToken
            ? "Select token to sell"
            : !toToken
            ? "Select token to buy"
            : !sellAmount || amountNum <= 0
            ? "Enter amount"
            : insufficientFunds
            ? "Insufficient funds"
            : quoteLoading
            ? "Fetching quote…"
            : quoteError
            ? "Invalid route"
            : "Swap"}
        </Button>
      </div>
    </>
  );
}

function TokenIcon({ token, size = "md" }: { token: TokenPosition | null; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-6 h-6" : "w-8 h-8";
  const px = size === "sm" ? 24 : 32;
  if (!token) return <div className={`${dim} rounded-full bg-white/10 shrink-0`} />;
  if (token.iconUrl) {
    return (
      <span className={`relative ${dim} shrink-0 rounded-full overflow-hidden bg-white/10`}>
        <Image src={token.iconUrl} alt="" width={px} height={px} className="object-cover" unoptimized />
      </span>
    );
  }
  return (
    <span className={`${dim} shrink-0 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-gold`}>
      {token.symbol.slice(0, 2)}
    </span>
  );
}
