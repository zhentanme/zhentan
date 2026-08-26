"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { BackupAddressPicker } from "@/components/BackupAddressPicker";
import { MaoAvatar } from "@/components/MaoAvatar";
import { TelegramConnectCard } from "@/components/TelegramConnectCard";
import { useAuth } from "@/app/context/AuthContext";
import { useSafeTransitions } from "@/lib/useSafeUpgrade";
import { useTelegramLink } from "@/hooks/useTelegramLink";

/**
 * Wallet-upgrade wizard — an onboarding-style stepped dialog that walks a
 * below-`protected` wallet up a tier at a time. Like onboarding, it COLLECTS
 * the user's choices and executes a SINGLE owner-management transition at the
 * end (no chained txs, so there's no stale-owner-set race between them):
 *
 *   starter  → [enable agent] → [telegram] → [add backup?] → done
 *              add backup  ⇒ activateProtection (starter → protected, atomic)
 *              skip backup ⇒ enableAgentOnly     (starter → guarded)
 *   guarded  → [telegram] → [add backup] → done
 *              add backup  ⇒ addBackup           (guarded → protected)
 *
 * Telegram comes RIGHT AFTER enabling the agent (#136 follow-up): it is the
 * approval channel for the screening being turned on. Possible here (unlike
 * onboarding, where the backup key still determines the address) because the
 * wallet already exists — linking binds to the existing Safe.
 *
 * Renders nothing meaningful for protected/detached — the banner that opens it
 * only shows for starter/guarded.
 */
type Step = "agent" | "backup" | "pending" | "telegram" | "done";

export function UpgradeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { profile, busy, error, activateProtection, enableAgentOnly, addBackup } =
    useSafeTransitions();
  const { externalWalletAddress, setBackupAddress, refreshSafe } = useAuth();

  // The flow is fixed from the profile at open time — running a transition
  // flips the live profile mid-wizard, so we must not re-derive from it.
  const [flow, setFlow] = useState<"starter" | "guarded">(
    profile === "starter" ? "starter" : "guarded"
  );
  const [step, setStep] = useState<Step>(profile === "starter" ? "agent" : "backup");
  // Telegram (#134/#136.2): identical semantics to onboarding and the
  // settings ActivationDialog — the binding watch runs the whole time the
  // step is on screen; "Open bot" is a pure link.
  const { linked: telegramLinked, openBot, setWatching } = useTelegramLink();
  // Consent parity with onboarding (#136.8): skipping the backup key on the
  // starter flow accepts the guarded lockout trade-off — disclose it first.
  const [skipWarning, setSkipWarning] = useState(false);
  // The profile the running transition ends in — drives the pending step.
  const [expectedProfile, setExpectedProfile] = useState<"guarded" | "protected" | null>(null);

  useEffect(() => {
    if (!open) return;
    const starter = profile === "starter";
    setFlow(starter ? "starter" : "guarded");
    setStep(starter ? "agent" : telegramLinked ? "backup" : "telegram");
    setSkipWarning(false);
    setExpectedProfile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || step !== "telegram") return;
    setWatching(!telegramLinked);
    return () => setWatching(false);
  }, [open, step, telegramLinked, setWatching]);

  // Telegram was offered BEFORE the transition ran — done directly.
  const afterUpgrade = () => setStep("done");

  // Screened-path transitions (#136.3) execute asynchronously: poll the
  // record until the profile flips instead of declaring success early.
  useEffect(() => {
    if (!open || step !== "pending" || !expectedProfile) return;
    if (profile === expectedProfile) {
      afterUpgrade();
      return;
    }
    const t = setInterval(() => refreshSafe(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, expectedProfile, profile]);

  const runTransition = async (
    action: () => Promise<{ pending: boolean }>,
    target: "guarded" | "protected"
  ) => {
    try {
      const result = await action();
      if (result.pending) {
        setExpectedProfile(target);
        setStep("pending");
      } else {
        afterUpgrade();
      }
    } catch {
      /* error surfaced by the hook */
    }
  };

  const handleActivateWithBackup = () =>
    runTransition(flow === "starter" ? activateProtection : addBackup, "protected");

  const handleSkipBackup = async () => {
    if (flow === "guarded") {
      onClose();
      return;
    }
    await runTransition(enableAgentOnly, "guarded");
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
            <Button
              onClick={() => setStep(telegramLinked ? "backup" : "telegram")}
              className="w-full"
            >
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
              <div className="w-full flex items-center gap-3 rounded-md px-4 py-3 border border-safe/25 bg-safe/6">
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
            ) : flow === "starter" && skipWarning ? (
              /* Lockout disclosure — the same acknowledgment onboarding
                 requires before creating a guarded wallet (#136.8). */
              <div className="w-full p-[15px] rounded-md bg-watch/[0.06] border border-watch/18">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-watch mb-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Continue without a backup key?
                </p>
                <p className="text-xs leading-relaxed text-watch/85 mb-3">
                  Zhentan must co-sign every transaction. If its agent is ever
                  offline, your funds sit safe but wait. Adding a key later
                  takes one tap in Settings.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleSkipBackup}
                    disabled={busy}
                    className="flex-1 py-2.5 rounded-md border border-watch/35 text-watch text-xs font-semibold hover:bg-watch/10 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {busy ? "Enabling…" : "Enable anyway"}
                  </button>
                  <button
                    onClick={() => setSkipWarning(false)}
                    disabled={busy}
                    className="flex-1 py-2.5 rounded-md bg-gold text-ink-900 text-xs font-bold hover:bg-gold/90 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Add a key
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => (flow === "starter" ? setSkipWarning(true) : onClose())}
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
                onClick={() => setStep(telegramLinked ? "agent" : "telegram")}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground py-1 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            )}
          </StepShell>
        )}

        {/* ── Step: transition accepted, executing asynchronously ── */}
        {step === "pending" && (
          <motion.div
            key="pending"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", bounce: 0.15 }}
            className="flex flex-col items-center py-4"
          >
            <MaoAvatar state="thinking" size={64} />
            <h3 className="mt-4 text-lg font-semibold text-foreground">Upgrading your wallet</h3>
            <p className="text-xs text-muted-foreground mt-1.5 text-center max-w-xs leading-relaxed">
              The transition is signed and queued — it completes automatically
              in a moment. You can close this; your wallet updates on its own.
            </p>
            <Button onClick={onClose} className="mt-6 w-full max-w-xs">
              Close
            </Button>
          </motion.div>
        )}

        {/* ── Step: connect Telegram — shared card (#136.2) ── */}
        {step === "telegram" && (
          <StepShell
            key="telegram"
            icon={<MaoAvatar state="scanning" size={30} variant="detail" />}
            title="Connect Telegram"
            subtitle="Screening needs a way to reach you — connect Telegram to approve or reject reviews from anywhere. Skipping keeps alerts on email only."
          >
            {telegramLinked ? (
              <div className="w-full flex items-center gap-3 rounded-md px-4 py-3 border border-safe/25 bg-safe/6">
                <MaoAvatar state="cleared" size={22} variant="solid" />
                <p className="text-xs text-muted-foreground flex-1">Telegram connected</p>
              </div>
            ) : (
              <TelegramConnectCard onOpenBot={openBot} />
            )}

            <Button onClick={() => setStep("backup")} className="w-full">
              {telegramLinked ? "Continue" : "Skip for now"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
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
                <MaoAvatar state="cleared" size={40} interactive ambient={["nod", "glint"]} />
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
      <div className="w-14 h-14 rounded-md bg-gold/10 flex items-center justify-center mb-5">
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
