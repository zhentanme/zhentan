import Image from "next/image";
import { clsx } from "clsx";
import { UsdcIcon } from "./icons/UsdcIcon";
import { findFallbackTokenBySymbol } from "@/lib/tokenFallbacks";

interface TokenGlyphProps {
  /** Token symbol, e.g. "USDC" / "BNB". */
  symbol: string;
  /** Explicit icon URL (e.g. from a portfolio position); wins over symbol lookup. */
  iconUrl?: string | null;
  size?: number;
  className?: string;
}

/**
 * Renders a token's icon from its symbol. Resolution order:
 *   explicit iconUrl → known BNB Chain token (findFallbackTokenBySymbol) → UsdcIcon.
 * Used where we only have a token symbol (e.g. payment requests), so the row/dialog
 * shows the real asset instead of a hardcoded USDC mark.
 */
export function TokenGlyph({ symbol, iconUrl, size = 24, className }: TokenGlyphProps) {
  const sym = (symbol || "").trim().toUpperCase();
  const resolved = iconUrl ?? findFallbackTokenBySymbol(symbol)?.iconUrl ?? null;

  if (sym === "BNB") {
    return (
      <Image
        src="/bsc-yellow.png"
        alt=""
        width={size}
        height={size}
        className={clsx("object-contain shrink-0", className)}
      />
    );
  }

  if (resolved) {
    return (
      <span
        className={clsx("relative inline-block shrink-0 rounded-full overflow-hidden bg-foreground/10", className)}
        style={{ width: size, height: size }}
      >
        <Image src={resolved} alt="" fill className="object-cover" sizes={`${size}px`} unoptimized />
      </span>
    );
  }

  return <UsdcIcon size={size} className={clsx("shrink-0 opacity-90", className)} />;
}
