"use client";

import { motion as fmotion } from "framer-motion";
import { TwinTickLoader, type TwinTickVariant } from "@/components/TwinTickLoader";

export type ThemeLoaderVariant = "auth" | "transaction" | "default";

interface ThemeLoaderProps {
  /** Loading context (kept for API compat; the Twin Tick mark is shown regardless). */
  variant?: ThemeLoaderVariant;
  /** Custom icon — kept for API compat, no longer rendered (the mark is the loader). */
  icon?: React.ReactNode;
  imageSrc?: string;
  imageAlt?: string;
  /** Primary message, e.g. "Loading Zhentan". */
  message?: string;
  /** Secondary line, e.g. "Securing your session". */
  subtext?: string;
}

/**
 * Compact Twin Tick spinner for dialogs / cards. Defaults to the "orbit"
 * treatment (processing); pass `motion="scan"` for the screening/analysis beat.
 */
export function ThemeLoaderSpinner({
  motion = "orbit",
  size = 56,
}: {
  /** Twin Tick motion treatment. */
  motion?: Extract<TwinTickVariant, "orbit" | "scan" | "pulse" | "sequential">;
  size?: number;
  // legacy props kept so existing call sites compile unchanged:
  variant?: ThemeLoaderVariant;
  icon?: React.ReactNode;
  imageSrc?: string;
  imageAlt?: string;
}) {
  return <TwinTickLoader variant={motion} size={size} />;
}

/** Full-screen loader — calm "pulse" Twin Tick with message + subtext. */
export function ThemeLoader({
  message = "Loading...",
  subtext = "Securing your session",
}: ThemeLoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center h-screen hero-gradient gap-8">
      <div className="flex flex-col items-center gap-6">
        <TwinTickLoader variant="pulse" size={96} label={message} />
        <fmotion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="text-center space-y-1.5"
        >
          <p className="text-sm font-medium text-foreground/80">{message}</p>
          <p className="eyebrow text-muted-foreground/80">{subtext}</p>
        </fmotion.div>
      </div>
    </div>
  );
}
