import { clsx } from "clsx";

export type PillTone = "safe" | "watch" | "danger" | "gold" | "neutral";

interface PillProps {
  tone?: PillTone;
  size?: "md" | "sm";
  /** Leading status dot (colored via currentColor). */
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}

const toneMap: Record<PillTone, string> = {
  safe: "bg-safe/15 text-safe",
  watch: "bg-watch/15 text-watch",
  danger: "bg-danger/15 text-danger",
  gold: "bg-gold/15 text-gold",
  neutral: "bg-foreground/8 text-muted-foreground",
};

/** The canonical status pill: mono, uppercase, tracked. */
export function Pill({ tone = "neutral", size = "md", dot, className, children }: PillProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-mono uppercase tracking-wider",
        size === "md" ? "px-3 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]",
        toneMap[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current signal-dot" aria-hidden />}
      {children}
    </span>
  );
}
