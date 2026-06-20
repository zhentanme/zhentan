import { clsx } from "clsx";
import { TickButtonSpinner } from "@/components/TwinTickLoader";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
}

export function Button({
  children,
  variant = "primary",
  loading,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2.5 rounded-md px-5 sm:px-6 py-3 sm:py-3.5 text-base font-semibold tracking-tight transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[2.75rem] touch-manipulation",
        variant === "primary" &&
          "bg-gradient-to-br from-gold-light to-gold-500 text-ink-900 shadow-[0_8px_24px_-6px_rgba(196,148,40,0.45)] hover:brightness-105 active:brightness-95",
        variant === "secondary" &&
          "bg-foreground/8 hover:bg-foreground/12 text-foreground border border-border",
        variant === "ghost" &&
          "hover:bg-foreground/6 text-foreground/80",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <TickButtonSpinner size={18} />}
      {children}
    </button>
  );
}
