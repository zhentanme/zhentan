"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  KeyRound,
  Loader2,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { useLinkAccount } from "@privy-io/react-auth";

import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { BackupAddressPicker } from "@/components/BackupAddressPicker";
import { useAuth } from "@/app/context/AuthContext";
import { useSafeTransitions } from "@/lib/useSafeUpgrade";
import { useApiClient } from "@/lib/api/client";

/**
 * Wallet-upgrade wizard — an onboarding-style stepped dialog that walks a
 * below-`protected` wallet up a tier at a time. Like onboarding, it COLLECTS
 * the user's choices and executes a SINGLE owner-management transition at the
 * end (no chained txs, so there's no stale-owner-set race between them):
 *
 *   starter  → [enable agent] → [add backup?] → [telegram] → done
 *              add backup  ⇒ activateProtection (starter → protected, atomic)
 *              skip backup ⇒ enableAgentOnly     (starter → guarded)
 *   guarded  → [add backup] → done
 *              add backup  ⇒ addBackup           (guarded → protected)
 *
 * Renders nothing meaningful for protected/detached — the banner that opens it
 * only shows for starter/guarded.
 */
type Step = "agent" | "backup" | "telegram" | "done";

export function UpgradeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { profile, busy, error, activateProtection, enableAgentOnly, addBackup } =
    useSafeTransitions();
  const { externalWalletAddress, setBackupAddress, telegramUserId, safeAddress } =
    useAuth();
  const api = useApiClient();

  // The flow is fixed from the profile at open time — running a transition
  // flips the live profile mid-wizard, so we must not re-derive from it.
  const [flow, setFlow] = useState<"starter" | "guarded">(
    profile === "starter" ? "starter" : "guarded"
  );
  const [step, setStep] = useState<Step>(profile === "starter" ? "agent" : "backup");
  const [telegramLinked, setTelegramLinked] = useState(!!telegramUserId);

  useEffect(() => {
    if (!open) return;
    const starter = profile === "starter";
    setFlow(starter ? "starter" : "guarded");
    setStep(starter ? "agent" : "backup");
    setTelegramLinked(!!telegramUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Telegram: link only (no bot-connection polling) — mirrors onboarding's step.
  const [linkingTg, setLinkingTg] = useState(false);
  const { linkTelegram } = useLinkAccount({
    onSuccess: ({ linkedAccount, linkMethod }) => {
      if (linkMethod === "telegram") {
        const acc = linkedAccount as unknown as Record<string, unknown>;
        const tgUserId =
          (acc?.telegramUserId as string) ||
          (acc?.username as string) ||
          (acc?.subject as string);
        if (tgUserId && safeAddress) {
          setTelegramLinked(true);
          api.status.update({ safe: safeAddress, telegramChatId: String(tgUserId) }).catch(() => {});
          api.users.upsert({ safeAddress, telegramId: String(tgUserId) }).catch(() => {});
        }
      }
      setLinkingTg(false);
    },
    onError: () => setLinkingTg(false),
  });

  // After the backup step's transition runs: link Telegram (starter path) if it
  // isn't already, else finish.
  const afterUpgrade = () =>
    setStep(flow === "starter" && !telegramLinked ? "telegram" : "done");

  const handleActivateWithBackup = async () => {
    try {
      // starter → protected (atomic) or guarded → protected
      await (flow === "starter" ? activateProtection() : addBackup());
      afterUpgrade();
    } catch {
      /* error surfaced by the hook */
    }
  };

  const handleSkipBackup = async () => {
    if (flow === "guarded") {
      onClose();
      return;
    }
    try {
      await enableAgentOnly(); // starter → guarded
      afterUpgrade();
    } catch {
      /* error surfaced by the hook */
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Upgrade your wallet">
      <AnimatePresence mode="wait">
        {/* ── Step: enable the agent (starter only) ── */}
        {step === "agent" && (
          <StepShell
            key="agent"
            icon={<ShieldCheck className="w-7 h-7 text-gold" />}
            title="Enable AI screening"
            subtitle="Zhentan reviews every transaction before it executes — catching scams and mistakes. Next you can add a backup key so you always keep control."
          >
            <Button onClick={() => setStep("backup")} className="w-full">
              Enable the agent
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="text-[11px] text-muted-foreground/70 text-center leading-relaxed">
              Same wallet address throughout — you can stop at any step and
              upgrade the rest later.
            </p>
          </StepShell>
        )}

        {/* ── Step: add a backup key ── */}
        {step === "backup" && (
          <StepShell
            key="backup"
            icon={<KeyRound className="w-7 h-7 text-gold" />}
            title="Add a backup key"
            subtitle="A second key you control — your override. With it you can always move funds yourself at app.safe.global, even if Zhentan is ever offline."
          >
            {!externalWalletAddress ? (
              <BackupAddressPicker onSelect={setBackupAddress} />
            ) : (
              <div className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 border border-safe/25 bg-safe/6">
                <Check className="h-4 w-4 text-safe shrink-0" />
                <p className="text-xs text-muted-foreground font-mono truncate flex-1">
                  {externalWalletAddress}
                </p>
                <button
                  onClick={() => setBackupAddress(null)}
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Change
                </button>
              </div>
            )}

            {error && <p className="text-xs text-danger">{error}</p>}

            {externalWalletAddress ? (
              /* Address confirmed → a single enabled CTA (no dead disabled button). */
              <Button onClick={handleActivateWithBackup} disabled={busy} className="w-full">
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Upgrading...
                  </>
                ) : (
                  <>
                    {flow === "starter"
                      ? "Activate full protection"
                      : "Upgrade to full protection"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            ) : (
              <button
                onClick={handleSkipBackup}
                disabled={busy}
                className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground py-1.5 transition-colors disabled:opacity-50"
              >
                {flow === "starter"
                  ? "Skip — enable the agent without a backup key"
                  : "Maybe later"}
              </button>
            )}

            {flow === "starter" && (
              <button
                onClick={() => setStep("agent")}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground py-1 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            )}
          </StepShell>
        )}

        {/* ── Step: connect Telegram (starter path) ── */}
        {step === "telegram" && (
          <StepShell
            key="telegram"
            icon={<MessageCircle className="w-7 h-7 text-gold" />}
            title="Connect Telegram"
            subtitle="Get notified the moment a transaction needs your review, and approve or reject from anywhere."
          >
            {telegramLinked ? (
              <div className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 border border-safe/25 bg-safe/6">
                <Check className="h-4 w-4 text-safe shrink-0" />
                <p className="text-xs text-muted-foreground flex-1">
                  Telegram connected
                </p>
              </div>
            ) : (
              <button
                onClick={() => {
                  setLinkingTg(true);
                  linkTelegram();
                }}
                disabled={linkingTg}
                className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 border border-foreground/8 bg-foreground/4 hover:bg-foreground/6 transition-all disabled:opacity-60"
              >
                <div className="w-8 h-8 rounded-lg bg-foreground/6 flex items-center justify-center shrink-0">
                  {linkingTg ? (
                    <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                  ) : (
                    <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <p className="text-sm font-semibold text-foreground flex-1 text-left">
                  {linkingTg ? "Opening Telegram..." : "Connect Telegram"}
                </p>
                <ArrowRight className="h-4 w-4 text-muted-foreground/80 shrink-0" />
              </button>
            )}

            <Button onClick={() => setStep("done")} className="w-full">
              {telegramLinked ? "Continue" : "Done"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            {!telegramLinked && (
              <button
                onClick={() => setStep("done")}
                className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground py-1.5 transition-colors"
              >
                Skip for now
              </button>
            )}
          </StepShell>
        )}

        {/* ── Step: done ── */}
        {step === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", bounce: 0.2 }}
            className="flex flex-col items-center py-4"
          >
            <div className="relative w-16 h-16 flex items-center justify-center mb-5">
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-safe/50"
                animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
              />
              <div className="relative w-14 h-14 rounded-full bg-safe/15 flex items-center justify-center">
                <ShieldCheck className="h-7 w-7 text-safe" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-foreground">Wallet upgraded</h3>
            <p className="text-xs text-muted-foreground mt-1.5 text-center max-w-xs">
              Your Safe is at the same address — every transaction now runs through
              Zhentan.
            </p>
            <Button onClick={onClose} className="mt-6 w-full max-w-xs">
              Done
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
}

/** Shared step chrome — icon, title, subtitle, then the step's controls. */
function StepShell({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ type: "spring", bounce: 0.15 }}
      className="flex flex-col items-center w-full"
    >
      <div className="w-14 h-14 rounded-2xl bg-gold/10 flex items-center justify-center mb-5">
        {icon}
      </div>
      <h2 className="text-xl font-bold text-center mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground text-center mb-6 max-w-xs">
        {subtitle}
      </p>
      <div className="w-full max-w-xs space-y-3">{children}</div>
    </motion.div>
  );
}
