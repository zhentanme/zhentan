"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRightLeft } from "lucide-react";
import authIcon from "./icons/icon.png";

export type ThemeLoaderVariant = "auth" | "transaction" | "default";

interface ThemeLoaderProps {
  /** Loading context: auth (shield), transaction (arrows), or default (rings only) */
  variant?: ThemeLoaderVariant;
  /** Custom icon to show instead of variant default */
  icon?: React.ReactNode;
  /** Custom image src (overrides icon and variant); use for logos etc. */
  imageSrc?: string;
  /** Alt text when imageSrc is used */
  imageAlt?: string;
  /** Primary message, e.g. "Loading Zhentan" or "Processing transaction..." */
  message?: string;
  /** Secondary line, e.g. "Securing your session" */
  subtext?: string;
}

const VARIANT_ICONS: Record<ThemeLoaderVariant, React.ReactNode> = {
  auth: (
    <div className="relative w-10 h-10">
      <Image
        src={authIcon}
        alt=""
        fill
        className="object-contain"
        sizes="40px"
      />
    </div>
  ),
  transaction: <ArrowRightLeft className="w-7 h-7 text-gold" />,
  default: (
    <div className="w-2 h-2 rounded-full bg-gold shadow-[0_0_12px_rgba(229,168,50,0.8)] animate-pulse" />
  ),
};

function SpinnerRing() {
  return (
    <>
      <div
        className="absolute inset-0 w-14 h-14 rounded-full border-2 border-transparent border-t-gold border-r-gold/60 animate-spin"
        aria-hidden
      />
      <div
        className="absolute inset-0 w-14 h-14 rounded-full border-2 border-transparent border-b-gold/40 border-l-gold/80 animate-spin"
        style={{ animationDuration: "1.2s", animationDirection: "reverse" }}
        aria-hidden
      />
    </>
  );
}

function getCenterContent(
  variant: ThemeLoaderVariant,
  icon?: React.ReactNode,
  imageSrc?: string,
  imageAlt?: string
) {
  if (imageSrc) {
    return (
      <div className="relative w-10 h-10">
        <Image src={imageSrc} alt={imageAlt ?? ""} fill className="object-contain" sizes="40px" />
      </div>
    );
  }
  if (icon != null) return icon;
  return VARIANT_ICONS[variant];
}

/** Compact spinner matching ThemeLoader (rings + center icon). Use in dialogs/cards. */
export function ThemeLoaderSpinner({
  variant = "default",
  icon,
  imageSrc,
  imageAlt,
}: {
  variant?: ThemeLoaderVariant;
  icon?: React.ReactNode;
  imageSrc?: string;
  imageAlt?: string;
}) {
  return (
    <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
      <div className="absolute inset-0 w-14 h-14 rounded-full border-2 border-gold/30" aria-hidden />
      <SpinnerRing />
      <div className="absolute inset-0 flex items-center justify-center">
        {getCenterContent(variant, icon, imageSrc, imageAlt)}
      </div>
    </div>
  );
}

export function ThemeLoader({
  variant = "default",
  icon,
  imageSrc,
  imageAlt = "Loading",
  message = "Loading...",
  subtext = "Securing your session",
}: ThemeLoaderProps) {
  const centerContent = getCenterContent(variant, icon, imageSrc, imageAlt);

  return (
    <div className="flex flex-col items-center justify-center h-screen hero-gradient gap-8">
      <div className="flex flex-col items-center gap-6">
        <div className="relative w-14 h-14 flex items-center justify-center">
          {/* Background ring (always) */}
          <div
            className="absolute inset-0 w-14 h-14 rounded-full border-2 border-gold/30"
            aria-hidden
          />
          <SpinnerRing />
          <div className="absolute inset-0 flex items-center justify-center">
            {centerContent}
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="text-center space-y-1.5"
        >
          <p className="text-sm font-medium text-slate-300">{message}</p>
          <p className="text-xs text-slate-500 uppercase tracking-widest">{subtext}</p>
        </motion.div>
      </div>
    </div>
  );
}
