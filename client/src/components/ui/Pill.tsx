import { clsx } from "clsx";

export type PillTone = "safe" | "watch" | "danger" | "gold" | "neutral";

interface PillProps {
  tone?: PillTone;
  size?: "md" | "sm";
  /**
   * Colored shell + label for states that demand the user's eyes
   * (Blocked, In review, high risk). Default is the quiet chip:
   * hairline shell, neutral label, tone only in the dot.
   */
  strong?: boolean;
  /** Pulse the dot — actively-live states (Watching). */
  pulse?: boolean;
  className?: string;
  children: React.ReactNode;
}

const dotTone: Record<PillTone, string> = {
  safe: "text-safe bg-current signal-dot",
  watch: "text-watch bg-current signal-dot",
  danger: "text-danger bg-current signal-dot",
  gold: "text-gold-300 bg-current signal-dot",
  neutral: "text-muted-foreground/80 bg-current",
};

const strongShell: Record<PillTone, string> = {
  safe: "border-safe/30 bg-safe/[0.06] text-safe",
  watch: "border-watch/30 bg-watch/[0.06] text-watch",
  danger: "border-danger/30 bg-danger/[0.06] text-danger",
  gold: "border-gold/35 bg-gold/[0.07] text-gold-300",
  neutral: "", // neutral has no strong form
};

/**
 * Signal chip — the canonical status pill. State color lives in a small
 * glowing dot; the label stays quiet mono unless `strong` raises it.
 */
export function Pill({
  tone = "neutral",
  size = "md",
  strong,
  pulse,
  className,
  children,
}: PillProps) {
  const isStrong = strong && tone !== "neutral";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border font-mono font-semibold uppercase tracking-[0.08em] whitespace-nowrap",
        size === "md" ? "gap-1.5 px-2.5 h-[22px] text-[10px]" : "gap-[5px] px-2 h-[18px] text-[9px]",
        isStrong ? strongShell[tone] : "border-border bg-foreground/[0.03] text-foreground/70",
        className
      )}
    >
      <span
        className={clsx(
          "rounded-full shrink-0",
          size === "md" ? "h-1.5 w-1.5" : "h-[5px] w-[5px]",
          dotTone[tone],
          pulse && "animate-signal-pulse"
        )}
        aria-hidden
      />
      {children}
    </span>
  );
}
