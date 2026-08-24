"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Loader2, XIcon } from "lucide-react";
import { Dialog } from "./ui/Dialog";
import { TELEGRAM_BOT_USERNAME } from "@/lib/constants";
import { useTelegramPhoto } from "@/hooks/useTelegramPhoto";
import { TelegramLinkFlow } from "./TelegramLinkFlow";
import { MaoAvatar } from "./MaoAvatar";

/**
 * One-step activation (#134): open the bot chat, say hi, tap the personal
 * secure link the bot replies with. The dialog watches the server-truth
 * binding for as long as it is open (the owner starts that poll), so the
 * "Open bot" button is a pure link with no side effects.
 */
interface ActivationDialogProps {
  open: boolean;
  onClose: () => void;
  telegramLinked: boolean;
  unlinking: boolean;
  tgDisplayName: string | null;
  /** Opens the t.me chat — nothing else. */
  onOpenBot: () => void;
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
          {/* Mao clears the connection — twin ticks in the glass. */}
          <MaoAvatar state="cleared" size={52} interactive ambient={["nod", "pounce", "glint"]} />
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
  unlinking,
  tgDisplayName,
  onOpenBot,
  onUnlinkTelegram,
}: ActivationDialogProps) {
  const wasInitiallyCompleteRef = useRef(false);
  const [showSuccess, setShowSuccess] = useState(false);
  // Cross-device path (RFC 8628): type the bot's short code right here.
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const photoUrl = useTelegramPhoto({ enabled: open && telegramLinked });

  useEffect(() => {
    if (open) {
      wasInitiallyCompleteRef.current = telegramLinked;
      setShowSuccess(false);
      setShowCodeEntry(false);
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
                      <MaoAvatar state="cleared" size={26} variant="solid" />
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

                <div className="p-4 rounded-2xl border bg-gold/5 border-gold/20">
                  <div className="flex items-start gap-3">
                    <div className="relative w-11 h-11 shrink-0 flex items-center justify-center">
                      <motion.div
                        className="absolute inset-0 rounded-2xl border-2 border-gold/40"
                        animate={{ scale: [1, 1.25], opacity: [0.6, 0] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                      />
                      <div className="relative w-11 h-11 rounded-2xl bg-gold/10 flex items-center justify-center">
                        {/* Mao is already on watch while this dialog is open —
                            the sweep across his shades IS the listening state. */}
                        <MaoAvatar state="scanning" size={34} variant="detail" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-row justify-between items-start gap-3">
                      <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-semibold text-foreground">
                          Say hi to @{TELEGRAM_BOT_USERNAME}
                        </h4>
                        <div className="text-[11px] text-muted-foreground leading-relaxed max-w-56">
                          Send any message, then tap the secure link the bot
                          replies with — this connects the moment you do.
                        </div>
                      </div>
                      <button
                        onClick={onOpenBot}
                        className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-gold/10 text-gold hover:bg-gold/15 transition-all cursor-pointer inline-flex items-center gap-1.5 shrink-0"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open bot
                      </button>
                    </div>
                  </div>
                </div>

                {showCodeEntry ? (
                  <div className="p-4 rounded-2xl border bg-foreground/2 border-foreground/6">
                    <TelegramLinkFlow variant="embedded" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCodeEntry(true)}
                    className="w-full text-[11px] text-muted-foreground/80 hover:text-gold leading-relaxed text-center pt-1 transition-colors cursor-pointer"
                  >
                    Got a code from Telegram?{" "}
                    <span className="text-gold/90">Enter the short code here →</span>
                  </button>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
}
