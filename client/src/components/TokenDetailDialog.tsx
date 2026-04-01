"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { CheckCircle2, TrendingUp, TrendingDown } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiClient } from "@/lib/api/client";
import type { TokenPosition, TokenDetails, TokenChartData, ChartPeriod } from "@/types";

const PERIODS: { key: ChartPeriod; label: string }[] = [
  { key: "day",   label: "1D" },
  { key: "week",  label: "1W" },
  { key: "month", label: "1M" },
  { key: "year",  label: "1Y" },
  { key: "max",   label: "Max" },
];

function formatPrice(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 8 })}`;
}

function formatLargeUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatSupply(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(0);
}

function formatChartDate(ts: number, period: ChartPeriod): string {
  const d = new Date(ts * 1000);
  if (period === "day") {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (period === "week" || period === "month") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { value: number }[];
  label?: number;
  period: ChartPeriod;
}

function CustomTooltip({ active, payload, label, period }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-slate-400">{label != null ? formatChartDate(label, period) : ""}</p>
      <p className="text-white font-semibold mt-0.5">{formatPrice(payload[0].value)}</p>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  token: TokenPosition | null;
}

export function TokenDetailDialog({ open, onClose, token }: Props) {
  const api = useApiClient();
  const [details, setDetails] = useState<TokenDetails | null>(null);
  const [chartData, setChartData] = useState<Record<ChartPeriod, TokenChartData | null> | null>(null);
  const [period, setPeriod] = useState<ChartPeriod>("day");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token?.tokenId) return;
    setLoading(true);
    setError(null);
    try {
      const { tokenDetails, tokenChartData } = await api.tokens.getDetails(token.tokenId);
      setDetails(tokenDetails);
      setChartData(tokenChartData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load token data");
    } finally {
      setLoading(false);
    }
  }, [token?.tokenId, api.tokens]);

  useEffect(() => {
    if (open && token) {
      setDetails(null);
      setChartData(null);
      setPeriod("day");
      load();
    }
  }, [open, token?.tokenId]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentChart = chartData?.[period];
  const points = currentChart?.points ?? [];
  const priceChange = details?.marketData?.changes
    ? period === "day"   ? details.marketData.changes.percent1d
    : period === "week"  ? null
    : period === "month" ? details.marketData.changes.percent30d
    : period === "year"  ? details.marketData.changes.percent365d
    : details.marketData.changes.percent365d
    : null;

  const isUp = priceChange == null ? null : priceChange >= 0;
  const chartColor = isUp === false ? "#ef4444" : "#e5a832";

  const displayPrice = details?.marketData?.price ?? token?.price ?? null;
  const displayName  = details?.name  ?? token?.name  ?? "";
  const displayIcon  = details?.iconUrl ?? token?.iconUrl ?? null;
  const displaySymbol = details?.symbol ?? token?.symbol ?? "";

  return (
    <Dialog open={open} onClose={onClose} className="max-w-md">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-xl bg-white/6 flex items-center justify-center shrink-0 overflow-hidden">
          {displayIcon ? (
            <Image src={displayIcon} alt="" width={44} height={44} className="object-cover w-full h-full" unoptimized />
          ) : (
            <span className="text-sm font-bold text-gold">{displaySymbol.slice(0, 2)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-white truncate">{displayName}</span>
            {(details?.verified ?? token?.verified) && (
              <CheckCircle2 className="h-3.5 w-3.5 text-gold shrink-0" />
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{displaySymbol}</p>
        </div>
        <div className="text-right shrink-0">
          {loading && !displayPrice ? (
            <Skeleton className="h-5 w-20 mb-1" />
          ) : (
            <p className="font-bold text-white tabular-nums">{formatPrice(displayPrice)}</p>
          )}
          {loading && priceChange == null ? (
            <Skeleton className="h-3.5 w-12 ml-auto" />
          ) : priceChange != null ? (
            <div className={`flex items-center justify-end gap-0.5 text-xs font-medium ${isUp ? "text-emerald-400" : "text-red-400"}`}>
              {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isUp ? "+" : ""}{priceChange.toFixed(2)}%
            </div>
          ) : null}
        </div>
      </div>

      {/* Chart */}
      <div className="mb-3">
        {loading && !currentChart ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : error ? (
          <div className="h-40 flex items-center justify-center text-xs text-slate-500">{error}</div>
        ) : points.length > 0 ? (
          <motion.div
            key={period}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(v) => formatChartDate(v, period)}
                  tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(v) => formatPrice(v).replace("$", "")}
                />
                <Tooltip content={<CustomTooltip period={period} />} />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke={chartColor}
                  strokeWidth={1.5}
                  fill="url(#chartGradient)"
                  dot={false}
                  activeDot={{ r: 3, fill: chartColor, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        ) : (
          <div className="h-40 flex items-center justify-center text-xs text-slate-500">No chart data</div>
        )}
      </div>

      {/* Period selector */}
      <div className="flex gap-1 mb-5">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              period === key
                ? "bg-gold/15 text-gold"
                : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Market data */}
      {loading && !details ? (
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white/4 rounded-xl p-3">
              <Skeleton className="h-3 w-14 mb-2" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : details?.marketData ? (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Market Cap",  value: formatLargeUsd(details.marketData.marketCap) },
            { label: "FDV",         value: formatLargeUsd(details.marketData.fullyDilutedValuation) },
            { label: "Circulating", value: formatSupply(details.marketData.circulatingSupply) + ` ${displaySymbol}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/4 rounded-xl p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{label}</p>
              <p className="text-xs font-semibold text-white truncate">{value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Dialog>
  );
}
