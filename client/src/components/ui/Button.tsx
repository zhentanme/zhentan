import { clsx } from "clsx";
import { Loader2 } from "lucide-react";

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
        "inline-flex items-center justify-center gap-2.5 rounded-2xl px-5 sm:px-6 py-3 sm:py-3.5 text-base transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed min-h-[2.75rem] touch-manipulation font-bold",
        variant === "primary" &&
          "bg-claw hover:bg-claw-400 text-black shadow-[0_4px_20px_-2px_rgba(240,185,11,0.35)]",
        variant === "secondary" &&
          "bg-white/[0.08] hover:bg-white/[0.12] text-slate-200",
        variant === "ghost" &&
          "hover:bg-white/[0.06] text-slate-300",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-5 w-5 animate-spin" />}
      {children}
    </button>
  );
}
