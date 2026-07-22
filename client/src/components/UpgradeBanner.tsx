"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import { useSafeTransitions } from "@/lib/useSafeUpgrade";
import { UpgradeDialog } from "@/components/UpgradeDialog";

/**
 * Wallet-profile prompt that opens the upgrade wizard (UpgradeDialog):
 *   starter → subtle gold nudge ("Activate protection")
 *   guarded → prominent amber WARNING — the agent is on but there's no backup
 *             key, so the user can't reach the threshold alone (lockout risk).
 * Renders nothing for protected/detached wallets.
 */
export function UpgradeBanner({ className }: { className?: string }) {
  const { profile } = useSafeTransitions();
  const [open, setOpen] = useState(false);

  const isStarter = profile === "starter";
  const isGuarded = profile === "guarded";
  const showNudge = isStarter || isGuarded;

  // Keep the dialog mounted while it's open even after the transition upgrades
  // the profile past starter/guarded — otherwise the success step is unmounted
  // out from under the user the instant the Safe refreshes.
  if (!showNudge && !open) return null;

  return (
    <>
      <AnimatePresence>
        {showNudge && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className={className}
          >
            {isGuarded ? (
              /* ── Prominent lockout warning: agent on, no backup key ── */
              <div className="rounded-xl border border-watch/30 bg-watch/[0.08] overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="w-9 h-9 rounded-lg bg-watch/15 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-[18px] w-[18px] text-watch" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-foreground">
                      Add a backup key to stay in control
                    </p>
                    <p className="text-[11px] text-watch/90 mt-0.5 leading-relaxed">
                      Zhentan must approve every transaction. If the agent is ever
                      offline, your funds wait until you add a backup key you
                      control.
                    </p>
                  </div>
                  <button
                    onClick={() => setOpen(true)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-watch/40 text-watch text-xs font-semibold hover:bg-watch/10 transition-colors"
                  >
                    Add key
                  </button>
                </div>
              </div>
            ) : (
              /* ── Subtle nudge: no protection yet (starter) ── */
              <div className="rounded-xl border border-border bg-foreground/[0.03] overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-4 w-4 text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-foreground">
                      Activate Zhentan protection
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Add AI screening — and a backup key you control.
                    </p>
                  </div>
                  <button
                    onClick={() => setOpen(true)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/10 transition-colors"
                  >
                    Activate
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <UpgradeDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
