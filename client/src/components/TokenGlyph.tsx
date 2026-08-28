"use client";

import { useState } from "react";
import Image from "next/image";
import { clsx } from "clsx";
import { findFallbackTokenBySymbol } from "@/lib/tokenFallbacks";

/**
 * Runtime icon registry — populated from live portfolio data wherever it is
 * fetched (home, requests, useRequestActions), so a symbol-only surface
 * (request rows/dialog) resolves the same Zerion icon the portfolio shows,
 * without persisting display metadata anywhere. Module-level on purpose:
 * registration happens inside setState-driven fetches, so consumers
 * re-render and re-resolve after it fills.
 */
const RUNTIME_ICONS = new Map<string, string>();

export function registerTokenIcons(
  tokens: { symbol?: string | null; iconUrl?: string | null }[]
): void {
  for (const t of tokens) {
    const sym = t.symbol?.trim().toUpperCase();
    if (sym && t.iconUrl) RUNTIME_ICONS.set(sym, t.iconUrl);
  }
}

/**
 * THE uniform token-icon resolution (#142), shared by every surface
 * (activity rows, dialogs, request rows):
 *   1. explicit iconUrl (portfolio/Zerion data) — always wins
 *   2. local BNB asset
 *   3. runtime registry (live portfolio icons, registered above)
 *   4. known BNB Chain token table by symbol (findFallbackTokenBySymbol)
 *   5. null → the caller renders neutral initials, NEVER another token's mark
 */
export function resolveTokenIconUrl(symbol?: string, iconUrl?: string | null): string | null {
  if (iconUrl) return iconUrl;
  const sym = (symbol || "").trim();
  if (!sym) return null;
  if (sym.toUpperCase() === "BNB") return "/bsc-yellow.png";
  return (
    RUNTIME_ICONS.get(sym.toUpperCase()) ?? findFallbackTokenBySymbol(sym)?.iconUrl ?? null
  );
}

interface TokenGlyphProps {
  /** Token symbol, e.g. "USDC" / "BNB". */
  symbol: string;
  /** Explicit icon URL (e.g. from a portfolio position); wins over symbol lookup. */
  iconUrl?: string | null;
  size?: number;
  className?: string;
}

/**
 * Renders a token's icon: resolveTokenIconUrl order, with neutral initials
 * when nothing resolves or the image fails to load. Used by requests AND
 * transactions (via TokenAvatar) so an asset never changes look between
 * surfaces — and an unknown token never wears another token's icon.
 */
export function TokenGlyph({ symbol, iconUrl, size = 24, className }: TokenGlyphProps) {
  const [errored, setErrored] = useState(false);
  const sym = (symbol || "").trim().toUpperCase();
  const resolved = resolveTokenIconUrl(symbol, iconUrl);

  if (!resolved || errored) {
    return (
      <span
        className={clsx(
          "inline-flex items-center justify-center shrink-0 rounded-full bg-foreground/10 font-bold text-muted-foreground leading-none",
          className
        )}
        style={{ width: size, height: size, fontSize: Math.max(7, Math.round(size * 0.28)) }}
      >
        {(sym || "?").slice(0, 4)}
      </span>
    );
  }

  return (
    <span
      className={clsx(
        "relative inline-block shrink-0 rounded-full overflow-hidden bg-foreground/10",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src={resolved}
        alt=""
        fill
        className="object-cover"
        sizes={`${size}px`}
        unoptimized
        onError={() => setErrored(true)}
      />
    </span>
  );
}
