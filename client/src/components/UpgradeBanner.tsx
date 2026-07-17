"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, KeyRound, Loader2, ShieldCheck, Wallet } from "lucide-react";

import { useAuth } from "@/app/context/AuthContext";
import { useSafeTransitions } from "@/lib/useSafeUpgrade";
import { BackupAddressPicker } from "@/components/BackupAddressPicker";

/**
 * Wallet-profile nudge banner:
 *   starter → "Activate protection" (backup + agent, atomic — or agent-only)
 *   guarded → "Add your backup key" (unlock sovereignty + Safe-app override)
 * Renders nothing for protected/detached wallets.
 */
export function UpgradeBanner({ className }: { className?: string }) {
  const { externalWalletAddress, setBackupAddress } = useAuth();
  const { profile, backupKeyLinked, busy, error, activateProtection, enableAgentOnly, addBackup } =
    useSafeTransitions();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [agreedAgentOnly, setAgreedAgentOnly] = useState(false);
  const [done, setDone] = useState(false);

  const isStarter = profile === "starter";
  const isGuarded = profile === "guarded";
  if (!isStarter && !isGuarded && !done) return null;

  const shortBackup = externalWalletAddress
    ? `${externalWalletAddress.slice(0, 6)}…${externalWalletAddress.slice(-4)}`
    : null;

  const handlePrimary = async () => {
    try {
      if (isStarter) await activateProtection();
      else await addBackup();
      setDone(true);
    } catch {
      // error state handled by the hook
    }
  };

  return (
    <AnimatePresence>
      {(isStarter || isGuarded || done) && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0 }}
          className={className}
        >
          <div className="rounded-2xl border border-gold/25 bg-gold/[0.06] overflow-hidden">
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="w-10 h-10 rounded-xl bg-gold/12 flex items-center justify-center shrink-0">
                {done ? (
                  <Check className="h-5 w-5 text-safe" />
                ) : isStarter ? (
                  <ShieldCheck className="h-5 w-5 text-gold" />
                ) : (
                  <KeyRound className="h-5 w-5 text-gold" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {done
                    ? "Wallet upgraded"
                    : isStarter
                    ? "Activate Zhentan protection"
                    : "Upgrade your wallet: add a backup key"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {done
                    ? "Your Safe is protected — you hold the majority of keys."
                    : backupKeyLinked
                    ? `${isStarter ? "Add the screening agent and" : "Add"} ${shortBackup} as an owner — same address, full control stays with you.`
                    : "Pick a backup key — paste an address, a .eth/.bnb name, or connect a wallet. No signing needed."}
                </p>
                {error && <p className="text-xs text-danger mt-1">{error}</p>}
              </div>
              {!done &&
                (backupKeyLinked ? (
                  <button
                    onClick={handlePrimary}
                    disabled={busy}
                    className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/10 transition-colors disabled:opacity-60"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wallet className="h-3.5 w-3.5" />
                    )}
                    {busy ? "Upgrading..." : isStarter ? "Activate" : "Upgrade"}
                  </button>
                ) : (
                  <button
                    onClick={() => setPickerOpen((o) => !o)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/10 transition-colors"
                  >
                    Add backup key
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${pickerOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                ))}
            </div>

            <AnimatePresence>
              {!done && !backupKeyLinked && pickerOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-5 pb-4 space-y-3"
                >
                  <BackupAddressPicker
                    compact
                    onSelect={(addr) => {
                      setBackupAddress(addr);
                      setPickerOpen(false);
                    }}
                  />
                  {isStarter && (
                    <div className="pt-1 border-t border-border/50">
                      <button
                        onClick={async () => {
                          if (!agreedAgentOnly) {
                            setAgreedAgentOnly(true);
                            return;
                          }
                          try {
                            await enableAgentOnly();
                            setDone(true);
                          } catch {}
                        }}
                        disabled={busy}
                        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
                      >
                        {agreedAgentOnly
                          ? "I understand Zhentan must approve every transaction and my funds wait if it's offline — enable agent without backup"
                          : "Enable the agent without a backup key instead?"}
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
