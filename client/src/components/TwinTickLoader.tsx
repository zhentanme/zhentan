"use client";

import { clsx } from "clsx";
import s from "./TwinTickLoader.module.css";

export type TwinTickVariant = "sequential" | "orbit" | "pulse" | "scan" | "inline";

interface TwinTickLoaderProps {
  /** Motion treatment. See the Zhentan Loaders comp for intent. */
  variant?: TwinTickVariant;
  /** Pixel size (square). Defaults per variant. */
  size?: number;
  /** Animation speed multiplier (1 = comp default). */
  speed?: number;
  className?: string;
  /** Accessible label; defaults to "Loading". */
  label?: string;
}

const DEFAULT_SIZE: Record<TwinTickVariant, number> = {
  sequential: 148,
  orbit: 96,
  pulse: 96,
  scan: 96,
  inline: 26,
};

/** The two strokes of the bright (foreground) tick — ink halo + gold + shine. */
function BrightTick({ d, ink, gold, shine }: { d: string; ink: number; gold: number; shine?: number }) {
  return (
    <>
      <path d={d} pathLength={100} fill="none" stroke="var(--tt-ink)" strokeWidth={ink} strokeLinecap="round" strokeLinejoin="round" className={s.bright} />
      <path d={d} pathLength={100} fill="none" stroke="var(--tt-acc)" strokeWidth={gold} strokeLinecap="round" strokeLinejoin="round" className={s.bright} />
      {shine != null && (
        <path d={d} pathLength={100} fill="none" stroke="rgba(255,255,255,0.34)" strokeWidth={shine} strokeLinecap="round" strokeLinejoin="round" className={s.bright} />
      )}
    </>
  );
}

export function TwinTickLoader({
  variant = "orbit",
  size,
  speed = 1,
  className,
  label = "Loading",
}: TwinTickLoaderProps) {
  const px = size ?? DEFAULT_SIZE[variant];
  const style = { width: px, height: px, ["--tt-spd" as string]: String(speed) } as React.CSSProperties;

  // ── Inline: compact mark for rows / toasts (no ring) ──
  if (variant === "inline") {
    return (
      <span className={clsx(s.wrap, className)} style={style} role="status" aria-label={label}>
        <svg viewBox="0 0 128 128" className={s.svg} aria-hidden>
          <path d="M22 56 L44 76 L82 30" pathLength={100} fill="none" stroke="var(--tt-ghost)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" className={s.ghost} />
          <BrightTick d="M40 74 L62 94 L100 48" ink={26} gold={16} />
        </svg>
      </span>
    );
  }

  // ── Scan: lens line sweeps the drawing mark ──
  if (variant === "scan") {
    return (
      <span className={clsx(s.wrap, s.scanBox, className)} style={style} role="status" aria-label={label}>
        <svg viewBox="0 0 128 128" className={s.svg} aria-hidden>
          <circle cx={60} cy={64} r={56} fill="none" stroke="var(--tt-ring)" strokeWidth={2} className={s.ringStatic} />
          <path d="M22 56 L44 76 L82 30" pathLength={100} fill="none" stroke="var(--tt-ghost)" strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" className={s.ghost} />
          <BrightTick d="M40 74 L62 94 L100 48" ink={24} gold={15} shine={3.5} />
        </svg>
        <span className={s.scanLine} aria-hidden />
      </span>
    );
  }

  // ── Orbit: gold arc orbits the ring while the mark resolves ──
  if (variant === "orbit") {
    return (
      <span className={clsx(s.wrap, className)} style={style} role="status" aria-label={label}>
        <svg viewBox="0 0 128 128" className={s.svg} aria-hidden>
          <circle cx={64} cy={64} r={56} fill="none" stroke="var(--tt-ring)" strokeWidth={2} className={s.ringStatic} />
          <circle cx={64} cy={64} r={56} fill="none" stroke="var(--tt-acc)" strokeWidth={3} strokeLinecap="round" pathLength={100} strokeDasharray="22 78" className={s.orbitArc} />
          <path d="M28 58 L48 76 L84 36" pathLength={100} fill="none" stroke="var(--tt-ghost)" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" className={s.ghost} />
          <BrightTick d="M44 74 L62 90 L96 50" ink={20} gold={12} />
        </svg>
      </span>
    );
  }

  // ── Pulse: the two ticks breathe in turn — calmest, ambient ──
  if (variant === "pulse") {
    return (
      <span className={clsx(s.wrap, className)} style={style} role="status" aria-label={label}>
        <svg viewBox="0 0 128 128" className={s.svg} aria-hidden>
          <circle cx={60} cy={64} r={56} fill="none" stroke="var(--tt-ring)" strokeWidth={2} className={s.ringStatic} />
          <g className={s.pulseGhost}>
            <path d="M22 56 L44 76 L82 30" fill="none" stroke="var(--tt-ghost)" strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <g className={s.pulseBright}>
            <path d="M40 74 L62 94 L100 48" fill="none" stroke="var(--tt-ink)" strokeWidth={24} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M40 74 L62 94 L100 48" fill="none" stroke="var(--tt-acc)" strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </svg>
      </span>
    );
  }

  // ── Sequential draw (primary): ring + ghost draw, then bright draw + pop ──
  return (
    <span className={clsx(s.wrap, className)} style={style} role="status" aria-label={label}>
      <svg viewBox="0 0 128 128" className={s.svg} aria-hidden>
        <circle cx={60} cy={64} r={56} fill="none" stroke="var(--tt-ring)" strokeWidth={2} className={s.ring} />
        <path d="M22 56 L44 76 L82 30" pathLength={100} fill="none" stroke="var(--tt-ghost)" strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" className={s.ghost} />
        <g className={s.pop}>
          <BrightTick d="M40 74 L62 94 L100 48" ink={24} gold={15} shine={3.5} />
        </g>
      </svg>
    </span>
  );
}

/**
 * Compact circular spinner for busy buttons / inline rows. Uses `currentColor`,
 * so it follows the button's text color (gold on dark, ink on gold buttons).
 */
export function TickButtonSpinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span className={clsx(s.wrap, className)} style={{ width: size, height: size }} role="status" aria-label="Loading">
      <svg viewBox="0 0 50 50" className={s.svg} aria-hidden>
        <circle cx={25} cy={25} r={20} fill="none" stroke="currentColor" strokeWidth={5} className={s.btnSpinnerTrack} />
        <circle cx={25} cy={25} r={20} fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" pathLength={100} strokeDasharray="25 75" className={s.btnSpinnerArc} />
      </svg>
    </span>
  );
}
