"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLinkAccount, usePrivy } from "@privy-io/react-auth";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/app/context/AuthContext";
import {
  ShieldCheck,
  ShieldOff,
  Loader2,
  MessageCircle,
  Cpu,
  Rocket,
  Server,
  ExternalLink,
  Settings,
  CheckCircle2,
  Circle,
  XIcon,
} from "lucide-react";
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
  const [screeningMode, setScreeningMode] = useState(true);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const [botConnected, setBotConnected] = useState(false);
  const [botActivationInitiated, setBotActivationInitiated] = useState(false);
  const [isCheckingBotConnection, setIsCheckingBotConnection] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { telegramUserId, privyUser, safeAddress } = useAuth();
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
          api.status.update({ safe: safeAddress!, telegramChatId: String(tgUserId) }).catch(() => {});
          api.users.upsert({ safeAddress: safeAddress!, telegramId: String(tgUserId) }).catch(() => {});
        }
      }
      setLinkingTelegram(false);
    },
    onError: () => {
      setLinkingTelegram(false);
    },
  });

  useEffect(() => {
    if (telegramUserId) setTelegramLinked(true);
  }, [telegramUserId]);

  useEffect(() => {
    if (!safeAddress) return;
    api.status.get(safeAddress)
      .then((data) => {
        setScreeningMode(data.screeningMode ?? true);
        setBotConnected(data.botConnected ?? false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [safeAddress, api]);

  const handleToggle = async () => {
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
      stopPolling();
      await api.status.update({ safe: safeAddress!, telegramChatId: "" });
      await api.users.upsert({ safeAddress: safeAddress!, telegramId: "" });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <main className="flex-1 w-full px-4 py-5 sm:p-6 max-w-lg mx-auto overflow-y-auto pb-24 sm:pb-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-5"
          >
            {/* Page Header */}
            <motion.div variants={staggerItem} className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-gold/10 flex items-center justify-center">
                <Settings className="h-[18px] w-[18px] text-gold" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">Settings</h1>
                <p className="text-xs text-slate-500">Screening & agent configuration</p>
              </div>
            </motion.div>

            {/* Zhentan Mode Toggle */}
            <motion.div variants={staggerItem}>
              <div className="flex items-center gap-4 p-5 rounded-2xl bg-white/2 border border-white/6">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-300 ${
                    screeningMode ? "bg-gold/10" : "bg-white/6"
                  }`}
                >
                  {screeningMode ? (
                    <ShieldCheck className="h-5 w-5 text-gold" />
                  ) : (
                    <ShieldOff className="h-5 w-5 text-slate-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white">Zhentan Mode</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {screeningMode ? "AI screening active" : "Screening disabled"}
                  </p>
                </div>

                <button
                  onClick={handleToggle}
                  disabled={toggling}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-gold/30 shrink-0 cursor-pointer disabled:cursor-default ${
                    screeningMode ? "bg-gold" : "bg-white/12"
                  }`}
                >
                  {toggling ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="h-3 w-3 animate-spin text-white" />
                    </span>
                  ) : (
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                        screeningMode ? "left-6" : "left-0.5"
                      }`}
                    />
                  )}
                </button>
              </div>
            </motion.div>

            {/* Warning when disabled */}
            <AnimatePresence>
              {!screeningMode && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, type: "spring" as const, bounce: 0.15 }}
                  className="rounded-2xl p-4 bg-amber-400/6 border border-amber-400/10"
                >
                  <p className="text-xs text-amber-400/90 leading-relaxed">
                    <strong className="text-amber-400">Warning:</strong>{" "}
                    Transactions will execute immediately without AI review. Make
                    sure you trust all destinations.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Current Plan */}
            <motion.div variants={staggerItem}>
              <div className={`p-5 rounded-2xl bg-white/2 border border-white/6 transition-all duration-500 ${!screeningMode ? "opacity-40" : ""}`}>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                      screeningMode ? "bg-gold/10" : "bg-white/6"
                    }`}
                  >
                    <Cpu
                      className={`h-[18px] w-[18px] transition-colors duration-300 ${
                        screeningMode ? "text-gold" : "text-slate-500"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">Free Plan</h3>
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-all duration-300 ${
                          screeningMode
                            ? "bg-gold/15 text-gold"
                            : "bg-white/6 text-slate-500"
                        }`}
                      >
                        {screeningMode ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">OpenClaw Instance</p>
                  </div>
                </div>

                {/* Telegram Setup — 2 steps */}
                <AnimatePresence>
                  {screeningMode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, type: "spring" as const, bounce: 0.1 }}
                      className="space-y-2"
                    >
                      {/* Step 1 — Link Telegram */}
                      <div className="flex items-start gap-3 p-3.5 rounded-xl bg-white/4">
                      
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              {telegramLinked ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              ) : (
                                <Circle className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                              )}
                              <h4 className="text-xs font-medium text-white">
                                Step 1 — Link Telegram
                              </h4>
                            </div>
                            {telegramLinked ? (
                              <button
                                onClick={handleUnlinkTelegram}
                                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white/6 text-red-400 hover:bg-white/10 hover:text-slate-300 transition-all cursor-pointer shrink-0 flex items-center gap-1"
                              >
                               {tgDisplayName}
                               <XIcon className="h-3 w-3 text-red-400" />
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setLinkingTelegram(true);
                                  linkTelegram();
                                }}
                                disabled={linkingTelegram}
                                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-blue-400/10 text-blue-400 hover:bg-blue-400/15 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-default shrink-0"
                              >
                                {linkingTelegram ? (
                                  <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                                ) : null}
                                Link Telegram
                              </button>
                            )}
                          </div>

                            {!telegramLinked && !tgDisplayName && (
                          <p className="text-[11px] text-slate-500 mt-1">
                              "Connect your Telegram account to receive notifications"
                          </p>
                              )}
                        </div>
                      </div>

                      {/* Step 2 — Ping the bot */}
                      <div
                        className={`flex items-start gap-3 p-3.5 rounded-xl bg-white/4 transition-opacity duration-300 ${
                          !telegramLinked || !tgDisplayName ? "opacity-40 pointer-events-none" : ""
                        }`}
                      >
                      
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              {botConnected && tgDisplayName ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              ) : (
                                <Circle className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                              )}
                              <h4 className="text-xs font-medium text-white">
                                Step 2 — Enable the Agent
                              </h4>
                            </div>
                     
                              <button
                  
                                onClick={botActivationInitiated ? checkBotConnection : handleStartBotActivation}
                                disabled={isCheckingBotConnection || !telegramLinked || botActivationInitiated}
                                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-blue-400/10 text-blue-400 hover:bg-blue-400/15 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-default shrink-0"
                              >
                                {isCheckingBotConnection && (
                                  <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                                )}
                                { botConnected ? "Connected" : botActivationInitiated ? "Started" : "Start"}
                              </button>
                        
                          </div>

                          <p className="text-[11px] text-slate-500 mt-1">
                            {!botConnected && (
                              <>
                              Send a "hi" message to{" "}
                                <a
                                  href="https://t.me/zhentanme_bot"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400/80 hover:text-blue-400 transition-colors"
                                >
                                  @zhentanme_bot
                                </a>{" "}
                                to activate notifications
                                </>
                            )}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* Upgrade Plans */}
            <AnimatePresence>
              {screeningMode && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: 0.4, type: "spring" as const, bounce: 0.12 }}
                >
                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-3 px-1">
                    Upgrade
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Advanced Plan */}
                    <div className="p-4 rounded-2xl bg-white/2 border border-white/6 opacity-50 pointer-events-none">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-purple-400/[0.08] flex items-center justify-center">
                            <Rocket className="h-4 w-4 text-purple-400" />
                          </div>
                          <h4 className="text-sm font-semibold text-white">Advanced</h4>
                        </div>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-400/[0.08] text-purple-400">
                          Soon
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-400/[0.06] text-[11px] font-mono text-purple-300/80">
                        Claude Sonnet 4.5
                      </span>
                      <p className="text-[11px] text-slate-500 mt-2.5 leading-relaxed">
                        Dedicated OpenClaw instance with advanced AI model
                      </p>
                    </div>

                    {/* Self-hosted Plan */}
                    <div className="p-4 rounded-2xl bg-white/2 border border-white/6 opacity-50 pointer-events-none">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-white/[0.05] flex items-center justify-center">
                            <Server className="h-4 w-4 text-slate-400" />
                          </div>
                          <h4 className="text-sm font-semibold text-white">Self-hosted</h4>
                        </div>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-400/[0.08] text-purple-400">
                          Soon
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Run your own OpenClaw agent
                      </p>
                      <div className="flex items-center gap-1 mt-2.5 text-[11px] text-slate-500">
                        <ExternalLink className="h-3 w-3" />
                        docs.openclaw.ai
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </main>
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
