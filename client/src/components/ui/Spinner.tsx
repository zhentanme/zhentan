import { clsx } from "clsx";
import { TickButtonSpinner } from "@/components/TwinTickLoader";

interface SpinnerProps {
  className?: string;
  size?: number;
}

/** Compact brand spinner (Twin Tick circular). Follows `currentColor`. */
export function Spinner({ className, size = 24 }: SpinnerProps) {
  return <TickButtonSpinner size={size} className={clsx("text-gold", className)} />;
}
