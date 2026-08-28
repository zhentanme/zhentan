"use client";

import { useState } from "react";
import Image from "next/image";
import { clsx } from "clsx";
import { findFallbackTokenBySymbol } from "@/lib/tokenFallbacks";

/**
 * THE uniform token-icon resolution (#142), shared by every surface
 * (activity rows, dialogs, request rows):
 *   1. explicit iconUrl (portfolio/Zerion data) — always wins
 *   2. known BNB Chain token table by symbol (findFallbackTokenBySymbol)
 *   3. local BNB asset
 *   4. null → the caller renders neutral initials, NEVER another token's mark
 */
export function resolveTokenIconUrl(symbol?: string, iconUrl?: string | null): string | null {
  if (iconUrl) return iconUrl;
  const sym = (symbol || "").trim();
  if (!sym) return null;
  if (sym.toUpperCase() === "BNB") return "/bsc-yellow.png";
  return findFallbackTokenBySymbol(sym)?.iconUrl ?? null;
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
