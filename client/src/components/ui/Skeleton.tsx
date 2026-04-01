import { clsx } from "clsx";

interface SkeletonProps {
  className?: string;
  /** Optional fixed width e.g. "w-24" or "w-full" */
  /** Optional fixed height e.g. "h-4" or "h-8" */
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={clsx(
        "animate-pulse rounded-lg bg-white/8",
        className
      )}
      aria-hidden
    />
  );
}
