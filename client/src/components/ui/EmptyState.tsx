import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  /** Bare centered line for tight panel contexts (no icon tile). */
  compact?: boolean;
}

/** The one empty-state treatment: icon tile + title + optional hint. */
export function EmptyState({ icon: Icon, title, hint, compact }: EmptyStateProps) {
  if (compact) {
    return <p className="py-8 text-center text-sm text-muted-foreground/80">{title}</p>;
  }
  return (
    <div className="flex flex-col items-center justify-center text-center py-16">
      {Icon && (
        <div className="mb-4 w-12 h-12 rounded-md bg-foreground/6 flex items-center justify-center text-muted-foreground">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground/60">{hint}</p>}
    </div>
  );
}
