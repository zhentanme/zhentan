"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";

type ToastTone = "neutral" | "safe" | "danger";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {});

/** Fire a transient notice: `const toast = useToast(); toast("Couldn't refresh balances", "danger")`. */
export function useToast() {
  return useContext(ToastContext);
}

const TOAST_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const push = useCallback((message: string, tone: ToastTone = "neutral") => {
    const id = ++idRef.current;
    setToasts((t) => {
      // Collapse repeats of the same message instead of stacking them.
      if (t.some((x) => x.message === message)) return t;
      return [...t.slice(-2), { id, message, tone }];
    });
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_MS);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {mounted &&
        createPortal(
          <div className="fixed inset-x-0 bottom-20 sm:bottom-6 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none">
            <AnimatePresence>
              {toasts.map((t) => (
                <motion.div
                  key={t.id}
                  role="status"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.18 }}
                  className="pointer-events-auto flex items-center gap-2 max-w-sm rounded-md bg-card border border-border shadow-[0_16px_40px_-16px_rgba(0,0,0,0.5)] px-4 py-2.5 text-sm text-foreground"
                >
                  {t.tone === "safe" && <CheckCircle2 className="h-4 w-4 shrink-0 text-safe" aria-hidden />}
                  {t.tone === "danger" && <AlertCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden />}
                  <span className={clsx("min-w-0", t.tone === "neutral" && "text-muted-foreground")}>
                    {t.message}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}
