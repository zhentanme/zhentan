"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { TELEGRAM_BOT_USERNAME } from "@/lib/constants";
import { MaoAvatar } from "./MaoAvatar";
import { TelegramLinkFlow } from "./TelegramLinkFlow";

/**
 * The ONE Telegram connect card (#136.2) — shared by the settings
 * ActivationDialog and the UpgradeDialog so the flow can never drift again:
 * Mao is already listening (the parent owns the watch poll), "Open bot" is a
 * pure t.me link with no side effects, and the RFC 8628 short-code entry is
 * one disclosure tap away.
 *
 * Render it only while NOT linked; the parent renders its own connected
 * state. The parent must also keep the binding watch running while this is
 * on screen (useTelegramLink().setWatching).
 */
export function TelegramConnectCard({ onOpenBot }: { onOpenBot: () => void }) {
  // Cross-device path (RFC 8628): type the bot's short code right here.
  const [showCodeEntry, setShowCodeEntry] = useState(false);

  return (
    <div className="space-y-3 w-full">
      <div className="p-4 rounded-2xl border bg-gold/5 border-gold/20">
        <div className="flex items-start gap-3">
          <div className="relative w-11 h-11 shrink-0 flex items-center justify-center">
            <motion.div
              className="absolute inset-0 rounded-2xl border-2 border-gold/40"
              animate={{ scale: [1, 1.25], opacity: [0.6, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
            />
            <div className="relative w-11 h-11 rounded-2xl bg-gold/10 flex items-center justify-center">
              {/* Mao is already on watch while this card is visible — the
                  sweep across his shades IS the listening state. */}
              <MaoAvatar state="scanning" size={34} variant="detail" />
            </div>
          </div>
          <div className="flex-1 min-w-0 flex flex-row justify-between items-start gap-3">
            <div className="flex flex-col gap-1">
              <h4 className="text-sm font-semibold text-foreground">
                Say hi to @{TELEGRAM_BOT_USERNAME}
              </h4>
              <div className="text-[11px] text-muted-foreground leading-relaxed max-w-56">
                Send any message, then tap the secure link the bot replies
                with — this connects the moment you do.
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
    </div>
  );
}
