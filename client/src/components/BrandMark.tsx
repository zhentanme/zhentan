import Link from "next/link";
import * as React from "react";
import { clsx } from "clsx";

/* Wordmark styling — Manrope, tight, takes the foreground color. */
export const brandTextClass = "font-bold tracking-tight text-foreground";

/**
 * Twin Tick — the Zhentan logo mark. A double checkmark: a dark-gold ghost
 * tick (the agent, offset behind) under a bright gold front tick (you) — the
 * two co-signatures in agreement.
 *
 * Render <BrandMarkSprite /> once near the document root; it defines the gold
 * gradient (#ztgb) that every mark references.
 */
export function BrandMarkSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <linearGradient id="ztgb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f7d978" />
          <stop offset="0.5" stopColor="#ecc24a" />
          <stop offset="1" stopColor="#c8992c" />
        </linearGradient>
      </defs>
    </svg>
  );
}

interface TwinTickProps {
  /** Rendered width/height in px (the mark is square). */
  size?: number;
  /**
   * Color of the thin separation gap between the ghost and front ticks. Set it
   * to the background the mark sits on so the gap stays invisible. Pass "none"
   * to drop the gap entirely (e.g. on a transparent surface).
   */
  halo?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** The bare Twin Tick glyph. */
export function TwinTick({
  size = 32,
  halo = "#0a0d0e",
  className,
  style,
}: TwinTickProps) {
  const front = "M40 74 L62 94 L100 48";
  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      className={className}
      style={{ display: "block", ...style }}
      aria-hidden="true"
    >
      {/* ghost tick — the agent, offset behind */}
      <path
        d="M22 56 L44 76 L82 30"
        fill="none"
        stroke="#9a7526"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* separation gap — matches the background (invisible); omitted when "none" */}
      {halo !== "none" && (
        <path
          d={front}
          fill="none"
          stroke={halo}
          strokeWidth="24"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {/* front tick — you: gold gradient + soft highlight */}
      <path
        d={front}
        fill="none"
        stroke="url(#ztgb)"
        strokeWidth="15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={front}
        fill="none"
        stroke="rgba(255,255,255,0.32)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type BrandMarkSize = "sm" | "md" | "lg" | "xl" | "hero";

const SIZE_CONFIG: Record<BrandMarkSize, { icon: number; text: string }> = {
  sm: { icon: 26, text: "text-base" },
  md: { icon: 30, text: "text-lg" },
  lg: { icon: 36, text: "text-xl" },
  xl: { icon: 44, text: "text-2xl" },
  hero: { icon: 64, text: "text-4xl sm:text-5xl" },
};

interface BrandMarkProps {
  href?: string;
  size?: BrandMarkSize;
  iconSize?: number;
  iconClassName?: string;
  textClassName?: string;
  className?: string;
  /** Background color behind the mark, for the separation gap. */
  halo?: string;
  /** Hide the "Zhentan" wordmark, render the glyph only. */
  iconOnly?: boolean;
  glow?: boolean;
  /** Accepted for call-site compatibility; the inline mark needs no preload. */
  priority?: boolean;
}

export function BrandMark({
  href,
  size = "md",
  iconSize,
  iconClassName,
  textClassName,
  className,
  halo = "#0a0d0e",
  iconOnly,
  glow,
}: BrandMarkProps) {
  const config = SIZE_CONFIG[size];
  const resolvedIconSize = iconSize ?? config.icon;
  const resolvedTextClassName =
    textClassName ?? clsx(brandTextClass, config.text);

  const content = (
    <>
      <TwinTick
        size={resolvedIconSize}
        halo={halo}
        className={clsx(
          "shrink-0",
          glow && "drop-shadow-[0_0_22px_rgba(196,148,40,0.45)]",
          iconClassName
        )}
      />
      {!iconOnly && <span className={resolvedTextClassName}>Zhentan</span>}
    </>
  );

  const wrapperClass = clsx("flex items-center gap-2.5", className);

  if (href) {
    return (
      <Link href={href} className={wrapperClass} aria-label="Zhentan">
        {content}
      </Link>
    );
  }

  return <div className={wrapperClass}>{content}</div>;
}
