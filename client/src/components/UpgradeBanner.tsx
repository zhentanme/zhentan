"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { useAuth } from "@/app/context/AuthContext";
import { useSafeTransitions } from "@/lib/useSafeUpgrade";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import {
  clearPendingTransition,
  readPendingTransition,
  type PendingTransitionMarker,
} from "@/lib/pendingTransition";

/**
 * Wallet-profile prompt that opens the upgrade wizard (UpgradeDialog):
 *   starter → subtle gold nudge ("Activate protection")
 *   guarded → prominent amber WARNING — the agent is on but there's no backup
 *             key, so the user can't reach the threshold alone (lockout risk).
 * Renders nothing for protected/detached wallets.
 *
 * Variants: "banner" is the standalone card (home page); "row" renders as a
 * divider-topped row inside the settings Protection card.
 */
export function UpgradeBanner({
  className,
  variant = "banner",
}: {
  className?: string;
  variant?: "banner" | "row";
}) {
  const { profile } = useSafeTransitions();
  const { refreshSafe, safeConfig } = useAuth();
  const [open, setOpen] = useState(false);
  // In-flight screened transition (#136.8): the dialog may be long closed
  // while the transition executes server-side — this banner is the always-
  // mounted surface, so IT owns the record polling and the honest
  // "in progress" state (instead of nudging to start an upgrade that is
  // already running).
  const [pending, setPending] = useState<PendingTransitionMarker | null>(null);

  useEffect(() => {
    const sync = () => setPending(readPendingTransition());
    sync();
    window.addEventListener("zhentan:pending-transition", sync);
    return () => window.removeEventListener("zhentan:pending-transition", sync);
  }, []);

  // Same-profile transitions (backup swap) complete only when the OWNER SET
  // matches the expected end state — the profile never changes for them.
  const ownersMatch = (marker: { expectedOwners?: string[] }): boolean => {
    if (!marker.expectedOwners) return true;
    const live = (safeConfig?.owners ?? []).map((o) => o.toLowerCase());
    return (
      live.length === marker.expectedOwners.length &&
      marker.expectedOwners.every((o) => live.includes(o))
    );
  };

  useEffect(() => {
    if (!pending) return;
    if (profile === pending.target && ownersMatch(pending)) {
      clearPendingTransition();
      setPending(null);
      return;
    }
    const t = setInterval(() => {
      refreshSafe();
      if (!readPendingTransition()) setPending(null); // marker expired
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, profile, safeConfig?.owners, refreshSafe]);

  const isStarter = profile === "starter";
  const isGuarded = profile === "guarded";
  const upgrading = !!pending && !(profile === pending.target && ownersMatch(pending));
  const showNudge = isStarter || isGuarded;

  // Keep the dialog mounted while it's open even after the transition upgrades
  // the profile past starter/guarded — otherwise the success step is unmounted
  // out from under the user the instant the Safe refreshes.
  // A pending transition renders the in-progress card for ANY profile —
  // swap/detach start from protected, where the nudge itself never shows.
  if (!showNudge && !open && !upgrading) return null;

  return (
    <>
      <AnimatePresence>
        {(showNudge || upgrading) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className={className}
          >
            {upgrading ? (
              /* ── Transition executing server-side — not a nudge moment ── */
              <div
                className={
                  variant === "row"
                    ? "flex items-center gap-3.5 p-[18px] border-t border-border"
                    : "rounded-md border border-gold/25 bg-gold/[0.04] flex items-center gap-3 px-4 py-3.5"
                }
              >
                <div className="w-9 h-9 rounded-md bg-gold/10 flex items-center justify-center shrink-0">
                  <Loader2 className="h-[17px] w-[17px] text-gold animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">Upgrade in progress</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Your transition is signed and executing — this updates by
                    itself in a moment.
                  </p>
                </div>
              </div>
            ) : variant === "row" ? (
              /* ── Settings Protection-card row ── */
              isGuarded ? (
                <div className="flex items-center gap-3.5 p-[18px] border-t border-border bg-watch/5">
                  <div className="w-9 h-9 rounded-md bg-watch/10 flex items-center justify-center shrink-0">
                    <KeyRound className="h-[17px] w-[17px] text-watch" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Add a backup key</p>
                    <p className="text-xs text-muted-foreground/85 mt-1 leading-relaxed">
                      Zhentan must approve every transaction. If the agent goes
                      offline, your funds wait until you add a key you control.
                    </p>
                  </div>
                  <button
                    onClick={() => setOpen(true)}
                    className="shrink-0 px-3.5 py-2 rounded-md bg-gold text-ink-900 text-xs font-semibold hover:bg-gold/90 transition-colors cursor-pointer"
                  >
                    Add key
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3.5 p-[18px] border-t border-border">
                  <div className="w-9 h-9 rounded-md bg-gold/10 flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-[17px] w-[17px] text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Activate Zhentan protection</p>
                    <p className="text-xs text-muted-foreground/85 mt-1 leading-relaxed">
                      Add AI screening — and a backup key you control.
                    </p>
                  </div>
                  <button
                    onClick={() => setOpen(true)}
                    className="shrink-0 px-3.5 py-2 rounded-md bg-gold text-ink-900 text-xs font-semibold hover:bg-gold/90 transition-colors cursor-pointer"
                  >
                    Activate
                  </button>
                </div>
              )
            ) : isGuarded ? (
              /* ── Prominent lockout warning: agent on, no backup key ── */
              <div className="rounded-md border border-watch/30 bg-watch/[0.08] overflow-hidden">
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
              <div className="rounded-md border border-border bg-foreground/[0.03] overflow-hidden">
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
