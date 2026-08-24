"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Send,
  ShieldCheck,
  XIcon,
} from "lucide-react";
import { Dialog } from "./ui/Dialog";
import { TELEGRAM_BOT_USERNAME } from "@/lib/constants";
import { useTelegramPhoto } from "@/hooks/useTelegramPhoto";

/**
 * One-step activation (#134): open the bot chat, say hi, tap the personal
 * secure link the bot replies with. The dialog just watches the server-truth
 * binding land.
 */
interface ActivationDialogProps {
  open: boolean;
  onClose: () => void;
  telegramLinked: boolean;
  /** True while we're waiting for the user to finish in the bot chat. */
  waiting: boolean;
  checking: boolean;
  unlinking: boolean;
  tgDisplayName: string | null;
  onStart: () => void;
  onCheck: () => void;
  onUnlinkTelegram: () => void;
}

function SuccessSplash({ onDone }: { onDone: () => void }) {
  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center py-6"
    >
      <div className="relative w-20 h-20 flex items-center justify-center mb-4">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-safe/60"
          animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.div
          className="absolute inset-2 rounded-full border-2 border-safe/40"
          animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut", delay: 0.3 }}
        />
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", bounce: 0.5, duration: 0.6 }}
          className="relative w-16 h-16 rounded-full bg-safe/15 flex items-center justify-center"
        >
          <ShieldCheck className="h-8 w-8 text-safe" />
        </motion.div>
      </div>
      <h3 className="text-lg font-semibold text-foreground">Zhentan Activated</h3>
      <p className="text-xs text-muted-foreground mt-1.5 text-center">
        Your AI agent is ready to screen transactions
      </p>
      <button
        onClick={onDone}
        className="mt-6 px-5 py-2 text-xs font-semibold rounded-xl bg-safe/15 text-safe hover:bg-safe/20 transition-all cursor-pointer"
      >
        Done
      </button>
    </motion.div>
  );
}

export function ActivationDialog({
  open,
  onClose,
  telegramLinked,
  waiting,
  checking,
  unlinking,
  tgDisplayName,
  onStart,
  onCheck,
  onUnlinkTelegram,
}: ActivationDialogProps) {
  const wasInitiallyCompleteRef = useRef(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const photoUrl = useTelegramPhoto({ enabled: open && telegramLinked });

  useEffect(() => {
    if (open) {
      wasInitiallyCompleteRef.current = telegramLinked;
      setShowSuccess(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (telegramLinked && !wasInitiallyCompleteRef.current) {
      setShowSuccess(true);
    }
  }, [open, telegramLinked]);

  return (
    <Dialog open={open} onClose={onClose} title="Activate Zhentan">
      <AnimatePresence mode="wait">
        {showSuccess ? (
          <SuccessSplash onDone={onClose} />
        ) : (
          <motion.div
            key="steps"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {telegramLinked ? (
              /* ── Connected: manage ── */
              <div className="p-4 rounded-2xl border bg-safe/5 border-safe/20">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-safe/15 flex items-center justify-center shrink-0 overflow-hidden">
                    {photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-safe" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-row justify-between items-start gap-3">
                    <div className="flex flex-col gap-1 min-w-0">
                      <h4 className="text-sm font-semibold text-foreground truncate">
                        Telegram connected
                      </h4>
                      <p className="text-[11px] text-safe/90 leading-relaxed truncate">
                        {tgDisplayName ?? "Alerts and approvals active"}
                      </p>
                    </div>
                    <button
                      onClick={onUnlinkTelegram}
                      disabled={unlinking}
                      className="px-2 py-1 text-[11px] font-medium rounded-lg bg-foreground/6 text-danger hover:bg-foreground/10 transition-all cursor-pointer flex items-center gap-1 disabled:opacity-50"
                    >
                      {unlinking ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <XIcon className="h-3 w-3" />
                      )}
                      Unlink
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-3">
                  Unlinking sets screening to manual and retires the chat&apos;s
                  pending approval messages. You can reconnect any time.
                </p>
              </div>
            ) : (
              /* ── Not connected: one step ── */
              <>
                <p className="text-xs text-muted-foreground leading-relaxed -mt-1 mb-4 text-center">
                  One step: message the bot, tap the secure link it sends back,
                  and your chat can approve or reject reviews.
                </p>

                <div
                  className={clsx(
                    "p-4 rounded-2xl border transition-colors duration-300",
                    waiting ? "bg-gold/5 border-gold/20" : "bg-foreground/2 border-foreground/6"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative w-10 h-10 shrink-0 flex items-center justify-center">
                      {waiting && (
                        <motion.div
                          className="absolute inset-0 rounded-2xl border-2 border-gold/40"
                          animate={{ scale: [1, 1.25], opacity: [0.6, 0] }}
                          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                        />
                      )}
                      <div
                        className={clsx(
                          "relative w-10 h-10 rounded-2xl flex items-center justify-center",
                          waiting ? "bg-gold/10" : "bg-foreground/6"
                        )}
                      >
                        {waiting ? (
                          <Loader2 className="h-5 w-5 animate-spin text-gold" />
                        ) : (
                          <Send className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-row justify-between items-start gap-3">
                      <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-semibold text-foreground">
                          Say hi to @{TELEGRAM_BOT_USERNAME}
                        </h4>
                        <div className="text-[11px] text-muted-foreground leading-relaxed max-w-56">
                          {waiting ? (
                            <>
                              Send any message to{" "}
                              <a
                                href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gold/90 hover:text-gold transition-colors"
                              >
                                @{TELEGRAM_BOT_USERNAME}
                              </a>
                              , then tap the secure link it replies with…
                            </>
                          ) : (
                            "The bot replies with your personal secure link — one tap connects this chat."
                          )}
                        </div>
                      </div>
                      <button
                        onClick={waiting ? onCheck : onStart}
                        disabled={checking}
                        className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-gold/10 text-gold hover:bg-gold/15 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-default inline-flex items-center gap-1.5 shrink-0"
                      >
                        {checking ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : !waiting ? (
                          <ExternalLink className="h-3 w-3" />
                        ) : null}
                        {waiting ? "Check again" : "Open bot"}
                      </button>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground/80 leading-relaxed text-center pt-1">
                  Telegram on another device? The bot&apos;s message also shows a
                  short code — enter it at{" "}
                  <a href="/link" className="text-gold/90 hover:text-gold transition-colors">
                    app.zhentan.me/link
                  </a>
                  .
                </p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
}
