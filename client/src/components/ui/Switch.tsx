import { Loader2 } from "lucide-react";
import { clsx } from "clsx";

interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  /** Accessible name for the switch. */
  label: string;
  disabled?: boolean;
  loading?: boolean;
}

/** Toggle switch — one implementation for every on/off setting. */
export function Switch({ checked, onChange, label, disabled, loading }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || loading}
      onClick={onChange}
      className={clsx(
        "relative shrink-0 w-12 h-6 rounded-full transition-colors cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/30",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        checked ? "bg-gold" : "bg-foreground/12"
      )}
    >
      {loading ? (
        <Loader2
          className={clsx(
            "absolute top-0.5 h-5 w-5 animate-spin",
            checked ? "left-6 text-ink-900" : "left-0.5 text-muted-foreground"
          )}
          aria-hidden
        />
      ) : (
        <span
          className={clsx(
            "absolute top-0.5 w-5 h-5 rounded-full bg-ink-0 shadow transition-all",
            checked ? "left-6" : "left-0.5"
          )}
          aria-hidden
        />
      )}
    </button>
  );
}
