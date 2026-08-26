import { clsx } from "clsx";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — icon-only buttons must always have one. */
  label: string;
  tone?: "neutral" | "danger";
}

/** Icon-only button: fixed padding/radius/hover so every icon control matches. */
export function IconButton({ label, tone = "neutral", className, children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex items-center justify-center p-2 rounded-md transition-colors cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        tone === "neutral" && "text-muted-foreground hover:text-foreground hover:bg-foreground/10",
        tone === "danger" && "text-muted-foreground hover:text-danger hover:bg-danger/10",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
