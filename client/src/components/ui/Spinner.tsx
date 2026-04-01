import { Loader2 } from "lucide-react";
import { clsx } from "clsx";

interface SpinnerProps {
  className?: string;
  size?: number;
}

export function Spinner({ className, size = 24 }: SpinnerProps) {
  return (
    <Loader2
      className={clsx("animate-spin text-gold", className)}
      size={size}
    />
  );
}
