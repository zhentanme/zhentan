"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { clsx } from "clsx";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  /** On viewports smaller than sm, show as bottom sheet (slide up from bottom). Default true. */
  sheetOnMobile?: boolean;
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
  sheetOnMobile = true,
}: DialogProps) {
  const isExitingRef = useRef(false);
  // Portal target only exists on the client; gate rendering until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      isExitingRef.current = false;
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
    isExitingRef.current = true;
  }, [open, handleEscape]);

  // Render into document.body so `position: fixed` is relative to the viewport,
  // not a transformed ancestor (framer-motion parents would otherwise clip it).
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 safe-area-bottom"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Panel: bottom sheet on mobile, centered on desktop */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "dialog-title" : undefined}
            className={clsx(
              "relative w-full max-w-md overflow-y-auto overflow-x-hidden",
              "bg-[#0f0f14] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.5)]",
              "flex flex-col",
              sheetOnMobile
                ? "max-h-[90vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl p-4 sm:p-6"
                : "max-h-[85vh] sm:max-h-[90vh] rounded-2xl p-4 sm:p-6",
              className
            )}
            initial={sheetOnMobile ? { y: "100%" } : { opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={sheetOnMobile ? { y: "100%" } : { opacity: 0, scale: 0.96 }}
            transition={{
              type: "spring",
              damping: 28,
              stiffness: 300,
            }}
            onClick={(e) => e.stopPropagation()}
            onAnimationComplete={() => {
              if (isExitingRef.current) {
                document.body.style.overflow = "";
                isExitingRef.current = false;
              }
            }}
          >
            {/* Drag handle on mobile for bottom sheet */}
            {sheetOnMobile && (
              <div className="sm:hidden flex justify-center pt-1 pb-2 -mx-4">
                <div className="w-10 h-1 rounded-full bg-white/20" aria-hidden />
              </div>
            )}
            <div className={clsx("relative flex items-center", title ? "mb-5" : "mb-0")}>
              {title && (
                <h2
                  id="dialog-title"
                  className="flex-1 text-center text-sm font-semibold text-white tracking-wide"
                >
                  {title}
                </h2>
              )}
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className={clsx(
                  "p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors",
                  title ? "absolute right-0 top-1/2 -translate-y-1/2" : "ml-auto"
                )}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
