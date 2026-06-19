"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLinkAccount, usePrivy } from "@privy-io/react-auth";
import { AuthGuard } from "@/components/AuthGuard";
import { ActivationDialog } from "@/components/ActivationDialog";
import { useAuth } from "@/app/context/AuthContext";
import { useScreeningStatus } from "@/app/context/ScreeningStatusContext";
import {
  ShieldCheck,
  ShieldOff,
  Loader2,
  Rocket,
  Server,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { clsx } from "clsx";
import { useApiClient } from "@/lib/api/client";

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
  const [toggling, setToggling] = useState(false);
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const [botActivationInitiated, setBotActivationInitiated] = useState(false);
  const [isCheckingBotConnection, setIsCheckingBotConnection] = useState(false);
  const [activationOpen, setActivationOpen] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoOpenedRef = useRef(false);
  const prevFullyActivatedRef = useRef<boolean | null>(null);
  const { telegramUserId, privyUser, safeAddress } = useAuth();
  const {
    screeningMode,
    botConnected,
    telegramLinked,
    fullyActivated,
    isScreeningActive,
    loading,
    setScreeningMode,
    setBotConnected,
    setTelegramLinked,
  } = useScreeningStatus();
  const api = useApiClient();
  const { unlinkTelegram } = usePrivy();

  // Extract TG account details for display
  const tgAccount = (privyUser?.linkedAccounts as unknown as Array<Record<string, unknown>> | undefined)
    ?.find((a) => a.type === "telegram");
  const tgUsername = tgAccount?.username as string | undefined;
  const tgFirstName = tgAccount?.firstName as string | undefined;
  const tgDisplayName = tgUsername ? `@${tgUsername}` : tgFirstName ?? (telegramUserId ? `ID ${telegramUserId}` : null);

  const { linkTelegram } = useLinkAccount({
    onSuccess: ({ linkedAccount, linkMethod }) => {
      if (linkMethod === "telegram") {
        const acc = linkedAccount as unknown as Record<string, unknown>;
        const tgUserId =
          (acc?.telegramUserId as string) ||
          (acc?.username as string) ||
          (acc?.subject as string);
        if (tgUserId) {
          setTelegramLinked(true);
          api.status.update({ safe: safeAddress!, telegramChatId: String(tgUserId) }).catch(() => { });
          api.users.upsert({ safeAddress: safeAddress!, telegramId: String(tgUserId) }).catch(() => { });
        }
      }
      setLinkingTelegram(false);
    },
    onError: () => {
      setLinkingTelegram(false);
    },
  });

  const handleToggle = async () => {
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
      // silent
    } finally {
      setToggling(false);
    }
  };

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const checkBotConnection = useCallback(async () => {
    if (!safeAddress) return;
    setIsCheckingBotConnection(true);
    try {
      const connected = await api.status.checkBotConnected(safeAddress);
      if (connected) {
        setBotConnected(true);
        stopPolling();
      }
    } catch {
      // silent
    } finally {
      setIsCheckingBotConnection(false);
    }
  }, [safeAddress, api, stopPolling]);

  const handleStartBotActivation = useCallback(() => {
    window.open("https://t.me/zhentanme_bot", "_blank");
    setBotActivationInitiated(true);
    // Begin polling every 4 seconds
    pollIntervalRef.current = setInterval(checkBotConnection, 4000);
  }, [checkBotConnection]);

  // Stop polling when bot connects or component unmounts
  useEffect(() => {
    if (botConnected) stopPolling();
  }, [botConnected, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Auto-enable screening the moment the user completes both activation steps.
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

  const handleUnlinkTelegram = async () => {
    try {
      if (tgAccount) {
        const identifier =
          (tgAccount.subject as string) ||
          (tgAccount.telegramUserId as string) ||
          (tgAccount.username as string);
        if (identifier) {
          await (unlinkTelegram as unknown as (id: string) => Promise<unknown>)(identifier);
        }
      }
      setTelegramLinked(false);
      setBotConnected(false);
      setBotActivationInitiated(false);
      setScreeningMode(false);
      stopPolling();
      await api.status.update({
        safe: safeAddress!,
        telegramChatId: "",
        screeningMode: false,
      });
      await api.users.upsert({ safeAddress: safeAddress!, telegramId: "" });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <main className="flex-1 w-full px-4 sm:px-8 lg:px-10 py-6 sm:py-8 overflow-y-auto pb-24 sm:pb-10">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
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
              className="space-y-7"
            >
              {/* Zhentan Guard card */}
              <motion.div variants={staggerItem}>
                <div className="relative rounded-lg bg-card overflow-hidden shadow-[0_20px_50px_-38px_rgba(0,0,0,0.7)]">
                  {/* Guard block */}
                  <div className="flex items-center gap-4 p-5 border-b border-border">
                    <div
                      className={clsx(
                        "w-10 h-10 rounded-md flex items-center justify-center shrink-0 transition-colors",
                        isScreeningActive ? "bg-gold/10 text-gold" : "bg-foreground/6 text-muted-foreground/80"
                      )}
                    >
                      {isScreeningActive ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">Zhentan Guard</h3>
                        <span
                          className={clsx(
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill text-[10px] font-mono uppercase tracking-wider",
                            isScreeningActive ? "bg-safe/12 text-safe" : "bg-foreground/8 text-muted-foreground"
                          )}
                        >
                          <span className={clsx("h-1.5 w-1.5 rounded-pill", isScreeningActive ? "bg-safe" : "bg-muted-foreground")} />
                          {isScreeningActive ? "Active" : "Paused"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/80 mt-0.5">
                        {isScreeningActive
                          ? "AI screening every signature against your patterns"
                          : !fullyActivated
                            ? "Finish setup to arm the co-signer"
                            : "Screening disabled — transactions execute immediately"}
                      </p>
                    </div>

                    <button
                      onClick={handleToggle}
                      disabled={toggling}
                      aria-label="Toggle screening"
                      className={clsx(
                        "relative w-12 h-6 rounded-pill transition-colors focus:outline-none focus:ring-2 focus:ring-gold/30 shrink-0 cursor-pointer disabled:cursor-default",
                        isScreeningActive ? "bg-gold" : "bg-foreground/12"
                      )}
                    >
                      {toggling ? (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <Loader2 className="h-3 w-3 animate-spin text-ink-900" />
                        </span>
                      ) : (
                        <span
                          className={clsx(
                            "absolute top-0.5 w-5 h-5 rounded-pill bg-ink-0 shadow-md transition-all",
                            isScreeningActive ? "left-6" : "left-0.5"
                          )}
                        />
                      )}
                    </button>
                  </div>

                  {/* Activation inset row */}
                  <div className="p-4">
                    <button
                      onClick={() => setActivationOpen(true)}
                      className="w-full flex items-center gap-3 p-3.5 rounded-md bg-foreground/[0.03] border border-border hover:bg-foreground/[0.05] transition-colors cursor-pointer text-left"
                    >
                      {fullyActivated ? (
                        <div className="w-8 h-8 rounded-md bg-safe/10 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="h-4 w-4 text-safe" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-md bg-watch/10 flex items-center justify-center shrink-0">
                          <AlertCircle className="h-4 w-4 text-watch" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-foreground">
                          {fullyActivated ? "Telegram alerts" : "Setup required"}
                        </p>
                        <p className="text-[11px] font-mono text-muted-foreground/80 truncate mt-0.5">
                          {fullyActivated
                            ? `${tgDisplayName ?? "Telegram"} · notifications active`
                            : "Complete 2 steps to enable the agent"}
                        </p>
                      </div>
                      <span className="shrink-0 px-3.5 py-2 rounded-md border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/10 transition-colors">
                        {fullyActivated ? "Manage" : "Activate"}
                      </span>
                    </button>
                  </div>
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
                      Transactions will execute immediately without AI review. Make sure you trust all destinations.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* UPGRADE section */}
              <motion.div variants={staggerItem}>
                <div className="pt-6 border-t border-dashed border-border">
                  <span className="eyebrow text-muted-foreground/60">Upgrade</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                  {/* Advanced Plan */}
                  <div className="p-4 rounded-md bg-card border border-border opacity-60 pointer-events-none">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-md bg-gold/[0.08] flex items-center justify-center">
                          <Rocket className="h-4 w-4 text-gold" />
                        </div>
                        <h4 className="text-sm font-semibold text-foreground">Advanced</h4>
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-pill bg-gold/[0.08] text-gold">
                        Soon
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gold/[0.06] text-[11px] font-mono text-gold-300/80">
                      Claude Sonnet 4.5
                    </span>
                    <p className="text-[11px] text-muted-foreground/80 mt-2.5 leading-relaxed">
                      Dedicated OpenClaw instance with advanced AI model
                    </p>
                  </div>

                  {/* Self-hosted Plan */}
                  <div className="p-4 rounded-md bg-card border border-border opacity-60 pointer-events-none">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-md bg-foreground/[0.05] flex items-center justify-center">
                          <Server className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <h4 className="text-sm font-semibold text-foreground">Self-hosted</h4>
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-pill bg-gold/[0.08] text-gold">
                        Soon
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                      Run your own OpenClaw agent
                    </p>
                    <div className="flex items-center gap-1 mt-2.5 text-[11px] font-mono text-muted-foreground/80">
                      <ExternalLink className="h-3 w-3" />
                      docs.openclaw.ai
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* APP section */}
              <motion.div variants={staggerItem}>
                <div className="pt-6 border-t border-dashed border-border">
                  <span className="eyebrow text-muted-foreground/60">App</span>
                </div>
                <div className="mt-1">
                  <div className="flex items-center justify-between gap-6 py-4 border-b border-dashed border-border">
                    <div className="min-w-0">
                      <p className="eyebrow text-muted-foreground">Network</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Chain the agent co-signs on</p>
                    </div>
                    <span className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground shrink-0">
                      <span className="h-1.5 w-1.5 rounded-pill bg-safe signal-dot" />
                      BNB Chain · Mainnet
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-6 py-4">
                    <div className="min-w-0">
                      <p className="eyebrow text-muted-foreground">Block explorer</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Where transaction links open</p>
                    </div>
                    <a
                      href="https://bscscan.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-[13px] font-medium text-foreground hover:border-gold/30 hover:text-gold transition-colors shrink-0"
                    >
                      BscScan
                      <ExternalLink className="h-3 w-3" />
                    </a>
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
        botConnected={botConnected}
        linkingTelegram={linkingTelegram}
        botActivationInitiated={botActivationInitiated}
        isCheckingBotConnection={isCheckingBotConnection}
        tgDisplayName={tgDisplayName}
        onLinkTelegram={() => {
          setLinkingTelegram(true);
          linkTelegram();
        }}
        onStartBotActivation={handleStartBotActivation}
        onCheckBotConnection={checkBotConnection}
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
