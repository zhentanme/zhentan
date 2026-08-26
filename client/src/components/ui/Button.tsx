import { clsx } from "clsx";
import { TickButtonSpinner } from "@/components/TwinTickLoader";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger";
  size?: "md" | "sm";
  loading?: boolean;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-md font-semibold tracking-tight transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        size === "md" && "gap-2.5 px-5 sm:px-6 py-3 sm:py-3.5 text-base min-h-11",
        size === "sm" && "gap-1.5 px-3.5 py-2 text-xs",
        variant === "primary" &&
          "bg-gradient-to-br from-gold-light to-gold-500 text-ink-900 shadow-[0_8px_24px_-6px_rgba(196,148,40,0.45)] hover:brightness-105 active:brightness-95",
        variant === "secondary" &&
          "bg-foreground/8 hover:bg-foreground/12 text-foreground border border-border",
        variant === "ghost" &&
          "hover:bg-foreground/6 text-foreground/80",
        variant === "outline" &&
          "border border-gold/30 text-gold hover:bg-gold/10",
        variant === "danger" &&
          "border border-danger/40 text-danger hover:bg-danger/10",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <TickButtonSpinner size={size === "sm" ? 14 : 18} />}
      {children}
    </button>
  );
}
