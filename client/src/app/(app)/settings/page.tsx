"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AuthGuard } from "@/components/AuthGuard";
import { ActivationDialog } from "@/components/ActivationDialog";
import { useAuth } from "@/app/context/AuthContext";
import { useScreeningStatus } from "@/app/context/ScreeningStatusContext";
import { useTelegramLink } from "@/hooks/useTelegramLink";
import { useTelegramPhoto } from "@/hooks/useTelegramPhoto";
import {
  Loader2,
  Rocket,
  Server,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  Zap,
  RotateCw,
  LogOut,
  KeyRound,
} from "lucide-react";
import { clsx } from "clsx";
import { useApiClient } from "@/lib/api/client";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { Pill } from "@/components/ui/Pill";
import { InlineError } from "@/components/ui/InlineError";
import { useToast } from "@/components/ui/Toast";
import { TwinTickLoader } from "@/components/TwinTickLoader";
import { BackupAddressPicker } from "@/components/BackupAddressPicker";
import { truncateAddress } from "@/lib/format";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { useSafeTransitions } from "@/lib/useSafeUpgrade";
import { readPendingTransition } from "@/lib/pendingTransition";
import { useForceExecuteSetting } from "@/lib/useForceExecute";
import { useTour } from "@/components/tour/TourProvider";
import { mainTour, upgradeTour } from "@/lib/tours";
import { MaoAvatar } from "@/components/MaoAvatar";

/** Section label + hairline rule, per the grouped settings design. */
function SectionHeader({ label, danger }: { label: string; danger?: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className={clsx("eyebrow", danger ? "text-danger/70" : "text-muted-foreground/60")}>
        {label}
      </span>
      <span className={clsx("h-px flex-1", danger ? "bg-danger/15" : "bg-border")} aria-hidden />
    </div>
  );
}

/**
 * One row of a grouped settings card: icon tile · title/description · action.
 * With `onClick` the whole row is the button (the action then renders as a
 * chip-styled span, since buttons can't nest).
 */
function SettingsRow({
  icon,
  iconTint,
  title,
  desc,
  action,
  onClick,
  className,
}: {
  icon: ReactNode;
  iconTint: string;
  title: ReactNode;
  desc?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const inner = (
    <>
      <div className={clsx("w-9 h-9 rounded-md flex items-center justify-center shrink-0", iconTint)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">{title}</div>
        {desc && <div className="text-xs text-muted-foreground/85 mt-1 leading-relaxed">{desc}</div>}
      </div>
      {action}
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "w-full flex items-center gap-3.5 p-4 text-left hover:bg-foreground/[0.03] transition-colors cursor-pointer",
        className
      )}
    >
      {inner}
    </button>
  ) : (
    <div className={clsx("flex items-center gap-3.5 p-4", className)}>{inner}</div>
  );
}

/**
 * Change the backup key (protected wallets only): an on-chain owner swap —
 * the new key replaces the old at the same address, hard-validated
 * server-side and co-signed by the agent like any profile transition.
 */
function BackupKeyRow() {
  const { swapBackup, busy, error, profile } = useSafeTransitions();
  const { externalWalletAddress, safeConfig } = useAuth();
  const [open, setOpen] = useState(false);
  // Pending swap (accepted, executing async): the record already names the
  // NEW key, but the OLD one stays live on-chain until the transition lands
  // — say so instead of silently claiming the swap is done.
  const [pendingSwap, setPendingSwap] = useState(false);
  useEffect(() => {
    const sync = () => {
      const marker = readPendingTransition();
      setPendingSwap(!!marker?.expectedOwners);
    };
    sync();
    window.addEventListener("zhentan:pending-transition", sync);
    return () => window.removeEventListener("zhentan:pending-transition", sync);
  }, [safeConfig?.owners]);

  if (profile !== "protected" || !externalWalletAddress) return null;

  return (
    <>
      <SettingsRow
        className="border-t border-border"
        icon={<KeyRound className="h-[17px] w-[17px]" />}
        iconTint="bg-foreground/5 text-muted-foreground"
        title="Backup key"
        desc={
          <>
            <span className="font-mono text-[11px] truncate block" title={externalWalletAddress}>
              {truncateAddress(externalWalletAddress)}
            </span>
            {pendingSwap && (
              <span className="block text-[11px] text-watch/90 mt-0.5">
                Swap in progress. The previous key stays active until it
                completes on-chain.
              </span>
            )}
          </>
        }
        action={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 inline-flex items-center px-3 py-1.5 rounded-md border border-border text-[13px] font-medium text-foreground hover:border-gold/30 hover:text-gold transition-colors cursor-pointer"
          >
            Change
          </button>
        }
      />
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Change backup key"
        className="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground/85 leading-relaxed">
            Replaces{" "}
            <span className="font-mono text-foreground/75">
              {truncateAddress(externalWalletAddress)}
            </span>{" "}
            as an owner, on-chain, at the same address. Pick a wallet you control.
          </p>
          {busy ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-gold" />
              Swapping owner on-chain…
            </div>
          ) : (
            <BackupAddressPicker
              onSelect={async (addr) => {
                try {
                  const result = await swapBackup(addr);
                  setOpen(false);
                  setPendingSwap(result.pending);
                } catch {
                  // error surfaced by the hook
                }
              }}
            />
          )}
          {error && <InlineError>{error}</InlineError>}
        </div>
      </Dialog>
    </>
  );
}

/**
 * The exit door: removes the agent as an owner, leaving a plain 2-of-2 Safe
 * (embedded + backup) the user fully controls at the same address. Shown for
 * protected wallets only — the one state that has an agent AND a backup key.
 */
function DetachZhentanCard() {
  const { detach, busy, error, profile } = useSafeTransitions();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  if (profile !== "protected" || done) return null;

  return (
    <motion.div variants={staggerItem}>
      <SectionHeader label="Danger zone" danger />
      <div className="rounded-md bg-card border border-danger/15 overflow-hidden">
        <SettingsRow
          icon={<LogOut className="h-[17px] w-[17px]" />}
          iconTint="bg-danger/10 text-danger"
          title="Detach Zhentan"
          desc={
            <>
              {confirming
                ? "Removes the agent as an owner. Your Safe becomes a plain 2-of-2 at the same address. Screening ends permanently."
                : "Leave with a stock Safe — remove the agent from your wallet."}
              {error && <p className="text-danger mt-1">{error}</p>}
            </>
          }
          action={
            <Button
              variant="danger"
              size="sm"
              loading={busy}
              className="shrink-0"
              onClick={async () => {
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                try {
                  await detach();
                  setDone(true);
                } catch {
                  // error surfaced by the hook
                }
              }}
            >
              {busy ? "Detaching…" : confirming ? "Yes, detach permanently" : "Detach"}
            </Button>
          }
        />
      </div>
    </motion.div>
  );
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, type: "spring" as const, bounce: 0.15 },
  },
};

function SettingsPageContent() {
  const toast = useToast();
  const [toggling, setToggling] = useState(false);
  const [activationOpen, setActivationOpen] = useState(false);
  const autoOpenedRef = useRef(false);
  const prevFullyActivatedRef = useRef<boolean | null>(null);
  const { safeAddress, safeConfig } = useAuth();
  const { start: startTour } = useTour();
  const {
    screeningMode,
    fullyActivated,
    isScreeningActive,
    loading,
    setScreeningMode,
  } = useScreeningStatus();
  const api = useApiClient();

  // One-step Telegram connect (#134): open the bot chat, the bot replies with
  // a personal secure link, the app session completes the binding.
  const {
    linked: telegramLinked,
    identity: tgIdentity,
    unlinking: tgUnlinking,
    openBot: openTelegramBot,
    setWatching: setWatchingTelegram,
    unlink: unlinkTelegramLink,
  } = useTelegramLink();

  // Watch for the binding the whole time the activation dialog is open — the
  // link can be completed from any device, not just behind the Open-bot tap.
  useEffect(() => {
    setWatchingTelegram(activationOpen && !telegramLinked);
  }, [activationOpen, telegramLinked, setWatchingTelegram]);

  const tgDisplayName = tgIdentity?.username
    ? `@${tgIdentity.username}`
    : tgIdentity?.name ?? (tgIdentity ? `ID ${tgIdentity.userId}` : null);
  const tgPhotoUrl = useTelegramPhoto({ enabled: telegramLinked });

  const profile = safeConfig?.profile ?? null;
  // Legacy v1 guarded wallets (pre-refactor 2-of-2) predate the strict model:
  // their users have always relied on the agent as co-signer, so they may
  // pause screening even though their key alone can't reach the threshold —
  // the agent keeps co-signing, just without risk analysis.
  const legacyV1Guarded =
    profile === "guarded" && (safeConfig?.derivationVersion ?? 1) === 1;
  // Screening is a CHOICE in protected wallets and legacy v1 guarded wallets.
  // New guarded wallets can't reach the threshold without the agent, and
  // starter/detached wallets have no agent to screen with.
  const screeningTogglable = profile === "protected" || legacyV1Guarded;

  const { enabled: forceExecuteEnabled, setEnabled: setForceExecuteEnabled } =
    useForceExecuteSetting(safeAddress);

  const handleToggle = async () => {
    if (!screeningTogglable) return;
    if (!fullyActivated) {
      setActivationOpen(true);
      return;
    }
    setToggling(true);
    try {
      const data = await api.status.update({ safe: safeAddress!, screeningMode: !screeningMode });
      if (typeof (data as { screeningMode?: boolean }).screeningMode === "boolean") {
        setScreeningMode((data as { screeningMode: boolean }).screeningMode);
      }
    } catch {
      toast("Couldn’t update screening — try again", "danger");
    } finally {
      setToggling(false);
    }
  };

  // One-click revoke entry point from the "new Telegram linked" alert email:
  // /settings?revoke-telegram=1 opens the manage dialog directly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("revoke-telegram")) {
      setActivationOpen(true);
    }
  }, []);

  // Auto-enable screening the moment activation completes.
  // Skip the initial load so a deliberate off-state isn't overridden.
  useEffect(() => {
    if (loading || !safeAddress) return;
    if (prevFullyActivatedRef.current === null) {
      prevFullyActivatedRef.current = fullyActivated;
      return;
    }
    if (!prevFullyActivatedRef.current && fullyActivated && !screeningMode) {
      api.status.update({ safe: safeAddress, screeningMode: true })
        .then(() => setScreeningMode(true))
        .catch(() => { });
    }
    prevFullyActivatedRef.current = fullyActivated;
  }, [loading, fullyActivated, screeningMode, safeAddress, api]);

  // Auto-open the activation dialog once on first load when setup is incomplete.
  useEffect(() => {
    if (loading) return;
    if (autoOpenedRef.current) return;
    if (screeningMode && !fullyActivated) {
      autoOpenedRef.current = true;
      // setActivationOpen(true);
    }
  }, [loading, screeningMode, fullyActivated]);

  // ONE server call, one transaction: binding cleared ⇔ screening set to
  // manual, stale chat messages retired — no more three-way best-effort writes.
  const handleUnlinkTelegram = async () => {
    try {
      await unlinkTelegramLink();
      setScreeningMode(false);
    } catch {
      /* ignore — state refreshes from the server either way */
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <main className="flex-1 w-full px-4 sm:px-8 lg:px-10 py-6 sm:py-8 overflow-y-auto scrollbar-hide pb-24 sm:pb-10">
        {loading ? (
          <div className="flex justify-center py-16">
            <TwinTickLoader variant="pulse" size={64} />
          </div>
        ) : (
          <>
            {/* Eyebrow */}
            <div className="flex items-center gap-3 mb-7">
              <span className="eyebrow text-muted-foreground">Settings</span>
              <span className="h-px flex-1 bg-border" aria-hidden />
            </div>

            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="space-y-8"
            >
              {/* PROTECTION — guard, alerts, and the backup-key nudge, one card */}
              <motion.div variants={staggerItem}>
                <SectionHeader label="Protection" />
                <div data-tour="guard-card" className="rounded-md bg-card overflow-hidden shadow-[0_20px_50px_-38px_rgba(0,0,0,0.7)]">
                  <SettingsRow
                    icon={
                      <MaoAvatar
                        state={isScreeningActive ? "scanning" : "resting"}
                        size={20}
                        variant="solid"
                        color="currentColor"
                      />
                    }
                    iconTint={clsx(
                      "transition-colors",
                      isScreeningActive ? "bg-gold/10 text-gold" : "bg-foreground/6 text-muted-foreground/80"
                    )}
                    title={
                      <>
                        <h3 className="text-sm font-semibold">Screening</h3>
                        <Pill tone={isScreeningActive ? "safe" : "neutral"} size="sm" pulse={isScreeningActive}>
                          {isScreeningActive ? "Watching" : "Paused"}
                        </Pill>
                      </>
                    }
                    desc={
                      profile === "guarded"
                        ? legacyV1Guarded
                          ? isScreeningActive
                            ? "Screening every signature — paused, the agent still co-signs"
                            : "Screening off — the agent co-signs without screening"
                          : telegramLinked
                            ? "Screening is always on — add a backup key to control it"
                            : "Screening is always on — reviews reach you by email until Telegram is connected"
                        : profile === "starter" || profile === "detached"
                          ? "No agent on this wallet — activate protection to enable screening"
                          : isScreeningActive
                            ? "Screening every signature against your patterns"
                            : !fullyActivated
                              ? "Finish setup to enable screening"
                              : "Screening off — your backup key co-signs instead of the agent"
                    }
                    action={
                      <Switch
                        checked={isScreeningActive}
                        onChange={handleToggle}
                        loading={toggling}
                        disabled={!screeningTogglable}
                        label={
                          screeningTogglable
                            ? "Toggle screening"
                            : profile === "guarded"
                              ? "Screening is locked on — add a backup key to control it"
                              : "Screening unavailable — no agent on this wallet"
                        }
                      />
                    }
                  />

                  {/* Telegram / activation — the whole row opens the dialog */}
                  <SettingsRow
                    className="border-t border-border"
                    onClick={() => setActivationOpen(true)}
                    icon={
                      fullyActivated ? (
                        tgPhotoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={tgPhotoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <CheckCircle2 className="h-[17px] w-[17px]" />
                        )
                      ) : (
                        <AlertCircle className="h-[17px] w-[17px]" />
                      )
                    }
                    iconTint={
                      fullyActivated
                        ? "bg-safe/10 text-safe overflow-hidden"
                        : "bg-watch/10 text-watch"
                    }
                    title={fullyActivated ? "Telegram alerts" : "Setup required"}
                    desc={
                      <span className="font-mono text-[11px] truncate block">
                        {fullyActivated
                          ? `${tgDisplayName ?? "Telegram"} · alerts active`
                          : "Connect Telegram to enable the agent"}
                      </span>
                    }
                    action={
                      <span className="shrink-0 px-3.5 py-2 rounded-md border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/10 transition-colors">
                        {fullyActivated ? "Manage" : "Activate"}
                      </span>
                    }
                  />

                  {/* Backup-key nudge (guarded/starter wallets only) */}
                  <UpgradeBanner variant="row" />
                </div>
              </motion.div>

              {/* Warning when disabled */}
              <AnimatePresence>
                {fullyActivated && !screeningMode && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, type: "spring" as const, bounce: 0.15 }}
                    className="flex items-start gap-2.5 rounded-md p-3.5 bg-watch/[0.07] border border-watch/15"
                  >
                    <AlertCircle className="h-3.5 w-3.5 text-watch shrink-0 mt-0.5" />
                    <p className="text-xs text-watch/90 leading-relaxed">
                      Transactions execute immediately, unscreened. Make sure you trust every destination.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* APP — wallet, network, force-execute, explorer, tour: one card */}
              <motion.div variants={staggerItem}>
                <SectionHeader label="App" />
                <div data-tour="wallet-card" className="rounded-md bg-card overflow-hidden shadow-[0_20px_50px_-38px_rgba(0,0,0,0.7)]">
                  <SettingsRow
                    icon={<LayoutGrid className="h-[18px] w-[18px]" />}
                    iconTint="bg-gold/10 text-gold"
                    title="Standard Safe wallet"
                    desc={
                      profile === "guarded"
                        ? "Add a backup key to sign from the Safe app yourself"
                        : profile === "starter"
                          ? "A standard Safe with your key — activate protection anytime"
                          : "Every transaction appears at app.safe.global — sign there anytime"
                    }
                    action={
                      safeAddress && (
                        <a
                          href={`https://app.safe.global/home?safe=bnb:${safeAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-[13px] font-medium text-foreground hover:border-gold/30 hover:text-gold transition-colors"
                        >
                          Open Safe
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )
                    }
                  />
                  <BackupKeyRow />
                  <SettingsRow
                    className="border-t border-border"
                    icon={<Zap className="h-[18px] w-[18px]" />}
                    iconTint="bg-gold/10 text-gold"
                    title="Force-execute"
                    desc={
                      forceExecuteEnabled
                        ? "Send gains a “skip the queue” option. Screening still applies."
                        : "Let a new transaction take a stuck one’s nonce and execute now."
                    }
                    action={
                      <Switch
                        checked={forceExecuteEnabled}
                        onChange={() => setForceExecuteEnabled(!forceExecuteEnabled)}
                        label="Toggle force-execute"
                      />
                    }
                  />
                  {safeAddress && (
                    <SettingsRow
                      className="border-t border-border"
                      icon={<RotateCw className="h-[18px] w-[18px]" />}
                      iconTint="bg-foreground/5 text-muted-foreground"
                      title="Product tour"
                      desc="Replay the walkthrough of your wallet"
                      action={
                        <button
                          type="button"
                          onClick={() =>
                            startTour(
                              /* Upgraded legacy accounts get their settings-focused
                                 tour; everyone else replays the full walkthrough. */
                              (safeConfig?.derivationVersion ?? 1) === 1 &&
                                safeConfig?.profile === "protected"
                                ? upgradeTour(safeAddress)
                                : mainTour(safeAddress)
                            )
                          }
                          className="shrink-0 inline-flex items-center px-3 py-1.5 rounded-md border border-border text-[13px] font-medium text-foreground hover:border-gold/30 hover:text-gold transition-colors cursor-pointer"
                        >
                          Replay
                        </button>
                      }
                    />
                  )}
                </div>
              </motion.div>

              {/* DANGER ZONE — detach the agent (protected wallets only) */}
              <DetachZhentanCard />

              {/* UPGRADE — future plans */}
              <motion.div variants={staggerItem}>
                <SectionHeader label="Upgrade" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Advanced Plan */}
                  <div className="p-4 rounded-md bg-card opacity-60 pointer-events-none">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-md bg-gold/[0.08] flex items-center justify-center">
                          <Rocket className="h-4 w-4 text-gold" />
                        </div>
                        <h4 className="text-sm font-semibold text-foreground">Advanced</h4>
                      </div>
                      <Pill tone="gold" size="sm">Soon</Pill>
                    </div>
                    <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                      Dedicated NanoBot/Hermes instance with advanced AI model
                    </p>
                  </div>

                  {/* Self-hosted Plan */}
                  <div className="p-4 rounded-md bg-card opacity-60 pointer-events-none">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-md bg-foreground/[0.05] flex items-center justify-center">
                          <Server className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <h4 className="text-sm font-semibold text-foreground">Self-hosted</h4>
                      </div>
                      <Pill tone="gold" size="sm">Soon</Pill>
                    </div>
                    <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                      Run your own NanoBot/Hermes agent
                    </p>
                    <div className="flex items-center gap-1 mt-2.5 text-[11px] font-mono text-muted-foreground/80">
                      <ExternalLink className="h-3 w-3" />
                      docs.zhentan.me 
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </main>

      <ActivationDialog
        open={activationOpen}
        onClose={() => setActivationOpen(false)}
        telegramLinked={telegramLinked}
        unlinking={tgUnlinking}
        tgDisplayName={tgDisplayName}
        onOpenBot={openTelegramBot}
        onUnlinkTelegram={handleUnlinkTelegram}
      />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsPageContent />
    </AuthGuard>
  );
}
