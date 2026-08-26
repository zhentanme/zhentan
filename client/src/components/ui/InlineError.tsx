import { AlertCircle } from "lucide-react";
import { clsx } from "clsx";

interface InlineErrorProps {
  children: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}

/** The one inline error treatment: icon + short message + optional retry. */
export function InlineError({ children, onRetry, className }: InlineErrorProps) {
  return (
    <p className={clsx("flex items-start gap-1.5 text-xs text-danger", className)}>
      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden />
      <span className="min-w-0">
        {children}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-1.5 font-semibold underline-offset-2 hover:underline cursor-pointer"
          >
            Try again
          </button>
        )}
      </span>
    </p>
  );
}
