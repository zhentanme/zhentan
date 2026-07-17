"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, KeyRound, Loader2, Wallet } from "lucide-react";
import { useLinkAccount } from "@privy-io/react-auth";

import { useAuth } from "@/app/context/AuthContext";
import { useSafeUpgrade } from "@/lib/useSafeUpgrade";

/**
 * Banner shown to legacy 2-of-2 users: link a backup wallet, then add it as a
 * third owner on-chain (same Safe address, threshold stays 2). Renders
 * nothing once the Safe is 2-of-3.
 */
export function UpgradeBanner({ className }: { className?: string }) {
  const { externalWalletAddress } = useAuth();
  const { needsUpgrade, backupKeyLinked, upgrading, error, upgrade } = useSafeUpgrade();
  const [linking, setLinking] = useState(false);
  const [done, setDone] = useState(false);

  const { linkWallet } = useLinkAccount({
    onSuccess: () => setLinking(false),
    onError: () => setLinking(false),
  });

  if (!needsUpgrade && !done) return null;

  const handleAction = async () => {
    if (!backupKeyLinked) {
      setLinking(true);
      try {
        linkWallet();
      } catch {
        setLinking(false);
      }
      return;
    }
    try {
      await upgrade();
      setDone(true);
    } catch {
      // error state already set by the hook
    }
  };

  return (
    <AnimatePresence>
      {(needsUpgrade || done) && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0 }}
          className={className}
        >
          <div className="flex items-center gap-4 rounded-2xl px-5 py-4 border border-gold/25 bg-gold/[0.06]">
            <div className="w-10 h-10 rounded-xl bg-gold/12 flex items-center justify-center shrink-0">
              {done ? (
                <Check className="h-5 w-5 text-safe" />
              ) : (
                <KeyRound className="h-5 w-5 text-gold" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {done ? "Wallet upgraded" : "Upgrade your wallet: add a backup key"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {done
                  ? "Your Safe is now 2-of-3 — you hold the majority of keys."
                  : backupKeyLinked
                  ? `Add ${externalWalletAddress?.slice(0, 6)}…${externalWalletAddress?.slice(-4)} as an owner — same address, full control stays with you.`
                  : "Connect a second wallet so you can always move funds without Zhentan."}
              </p>
              {error && <p className="text-xs text-danger mt-1">{error}</p>}
            </div>
            {!done && (
              <button
                onClick={handleAction}
                disabled={upgrading || linking}
                className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/10 transition-colors disabled:opacity-60"
              >
                {upgrading || linking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wallet className="h-3.5 w-3.5" />
                )}
                {upgrading ? "Upgrading..." : linking ? "Connecting..." : backupKeyLinked ? "Upgrade" : "Connect wallet"}
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
