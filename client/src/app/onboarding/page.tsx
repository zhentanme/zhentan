"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, AtSign, Check, MessageCircle, Loader2, X, XIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/app/context/AuthContext";
import { useApiClient } from "@/lib/api/client";
import { useLinkAccount, usePrivy } from "@privy-io/react-auth";
import {
  markOnboardingUsernameSkipped,
  markOnboardingUsernameSet,
  markOnboardingTelegramDone,
  markAllOnboardingSkipped,
} from "@/lib/useOnboarding";

/* ─── Step Indicator ─────────────────────────────────────────────── */

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === current
              ? "w-8 bg-gold"
              : i < current
              ? "w-4 bg-gold/40"
              : "w-4 bg-white/10"
          }`}
        />
      ))}
    </div>
  );
}

/* ─── Step 1: Choose Username ────────────────────────────────────── */

function UsernameStep({
  onSave,
  onSkip,
}: {
  onSave: (username: string) => Promise<void>;
  onSkip: () => void;
}) {
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isValid = username.trim().length >= 3;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(username.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save username");
      setSaving(false);
    }
  };

  return (
    <motion.div
      key="username"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: "spring", bounce: 0.15 }}
      className="flex flex-col items-center w-full"
    >
      <div className="w-14 h-14 rounded-2xl bg-gold/10 flex items-center justify-center mb-6">
        <AtSign className="w-7 h-7 text-gold" />
      </div>

      <h2 className="text-2xl font-bold text-center mb-2">Choose your username</h2>
      <p className="text-sm text-muted-foreground text-center mb-8 max-w-xs">
        This is how others will find you on Zhentan. You can change it later.
      </p>

      <div className="w-full max-w-xs space-y-4">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            @
          </span>
          <input
            type="text"
            value={username}
            onChange={(e) =>
              setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
            }
            placeholder="johndoe"
            maxLength={20}
            className="w-full rounded-2xl bg-white/6 pl-9 pr-4 py-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:bg-white/8 transition-all"
          />
        </div>

        {username.length > 0 && username.length < 3 && (
          <p className="text-xs text-amber-400/80 pl-1">At least 3 characters</p>
        )}
        {error && <p className="text-xs text-red-400 pl-1">{error}</p>}

        <Button onClick={handleSave} disabled={!isValid || saving} className="w-full">
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
          ) : (
            <>Continue <ArrowRight className="w-4 h-4" /></>
          )}
        </Button>

        <button
          onClick={onSkip}
          className="w-full text-sm text-muted-foreground/50 hover:text-muted-foreground py-2 transition-colors"
        >
          Skip for now
        </button>
      </div>
    </motion.div>
  );
}

/* ─── Step 2: Connect Telegram ───────────────────────────────────── */

const TelegramIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

function ConnectStep({
  safeAddress,
  onFinish,
  onSkip,
}: {
  safeAddress: string;
  onFinish: () => void;
  onSkip: () => void;
}) {
  const { telegramUserId, privyUser } = useAuth();
  const { unlinkTelegram } = usePrivy();
  const api = useApiClient();

  // Derive initial state from existing Privy linked accounts
  const existingTgAccount = (privyUser?.linkedAccounts as unknown as Array<Record<string, unknown>>)
    ?.find((a) => a.type === "telegram");
  const existingTgName =
    (existingTgAccount?.firstName as string) ||
    (existingTgAccount?.username as string) ||
    null;

  const [telegramLinked, setTelegramLinked] = useState(!!telegramUserId);
  const [tgUsername, setTgUsername] = useState<string | null>(existingTgName);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const { linkTelegram } = useLinkAccount({
    onSuccess: ({ linkedAccount, linkMethod }) => {
      if (linkMethod === "telegram") {
        const acc = linkedAccount as unknown as Record<string, unknown>;
        const tgUserId =
          (acc?.telegramUserId as string) ||
          (acc?.username as string) ||
          (acc?.subject as string);
        const name =
          (acc?.firstName as string) ||
          (acc?.username as string) ||
          null;
        if (tgUserId) {
          setTelegramLinked(true);
          setTgUsername(name);
          api.status.update({ safe: safeAddress, telegramChatId: String(tgUserId) }).catch(() => {});
          api.users.upsert({ safeAddress, telegramId: String(tgUserId) }).catch(() => {});
        }
      }
      setLinking(false);
    },
    onError: () => setLinking(false),
  });

  const handleDisconnect = async () => {
    setUnlinking(true);
    try {
      await (unlinkTelegram as unknown as (id: string) => Promise<unknown>)(
        tgUsername ?? "telegram"
      );
      setTelegramLinked(false);
      setTgUsername(null);
      api.status.update({ safe: safeAddress, telegramChatId: "" }).catch(() => {});
      api.users.upsert({ safeAddress, telegramId: "" }).catch(() => {});
    } catch {
      // ignore
    } finally {
      setUnlinking(false);
    }
  };

  return (
    <motion.div
      key="connect"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: "spring", bounce: 0.15 }}
      className="flex flex-col items-center w-full"
    >
      <div className="w-14 h-14 rounded-2xl bg-gold/10 flex items-center justify-center mb-6">
        <MessageCircle className="w-7 h-7 text-gold" />
      </div>

      <h2 className="text-2xl font-bold text-center mb-2">Connect Telegram</h2>
      <p className="text-sm text-muted-foreground text-center mb-8 max-w-xs">
        Get notified about transactions and manage your wallet from anywhere.
      </p>

      <div className="w-full max-w-xs space-y-4">
        <AnimatePresence mode="wait">
          {!telegramLinked ? (
            /* ── Not connected ── */
            <motion.div
              key="disconnected"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: "spring", bounce: 0.1 }}
            >
              <button
                onClick={() => { setLinking(true); linkTelegram(); }}
                disabled={linking}
                className="w-full flex items-center gap-4 rounded-2xl px-5 py-4 border border-white/8 bg-white/4 hover:bg-white/6 hover:border-white/12 transition-all duration-200 disabled:opacity-60 disabled:cursor-default"
              >
                <div className="w-10 h-10 rounded-xl bg-white/6 flex items-center justify-center shrink-0">
                  {linking
                    ? <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
                    : <TelegramIcon className="h-5 w-5 text-slate-400" />
                  }
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-slate-200">Connect Telegram</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {linking ? "Opening Telegram..." : "Review alerts & approve transactions"}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-500 shrink-0" />
              </button>
            </motion.div>
          ) : (
            /* ── Connected ── */
            <motion.div
              key="connected"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: "spring", bounce: 0.1 }}
            >
              <div className="flex flex-row justify-between items-center gap-4 rounded-2xl px-5 py-4 border border-white/8 bg-white/4">
                <div className="w-10 h-10 rounded-xl bg-white/6 flex items-center justify-center shrink-0">
                  <TelegramIcon className="h-5 w-5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-200">Telegram</p>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400">
                      Connected
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {tgUsername ? `@${tgUsername}` : "Account linked"}
                  </p>
                </div>
                <button
                onClick={handleDisconnect}
                disabled={unlinking}
                className="flex items-center justify-center gap-1.5 py-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors"
              >
                {unlinking ? <Loader2 className="h-5 w-5 animate-spin" /> : <XIcon className="h-5 w-5" />}
                
              </button>
              </div>

              
            </motion.div>
          )}
        </AnimatePresence>

        <Button onClick={onFinish} disabled={!telegramLinked} className="w-full">
          Continue
          <ArrowRight className="w-4 h-4" />
        </Button>

        <button
          onClick={onSkip}
          className="w-full text-sm text-muted-foreground/50 hover:text-muted-foreground py-2 transition-colors"
        >
          Skip for now
        </button>
      </div>
    </motion.div>
  );
}

/* ─── Step 3: Done ───────────────────────────────────────────────── */

function DoneStep({ username }: { username: string | null }) {
  const router = useRouter();

  return (
    <motion.div
      key="done"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", bounce: 0.2 }}
      className="flex flex-col items-center w-full"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.15, type: "spring", bounce: 0.4 }}
        className="w-16 h-16 rounded-full bg-gold flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(229,168,50,0.3)]"
      >
        <Check className="w-8 h-8 text-black" />
      </motion.div>

      <h2 className="text-2xl font-bold text-center mb-2">You're all set!</h2>
      {username && (
        <p className="text-sm text-muted-foreground text-center mb-2">
          Welcome, <span className="text-gold font-semibold capitalize">{username}</span>
        </p>
      )}
      <p className="text-xs text-muted-foreground/60 text-center max-w-xs mb-8">
        Your AI-secured wallet is ready. Every transaction will be screened and
        protected by Zhentan.
      </p>

      <Button onClick={() => router.replace("/")} className="w-full max-w-xs">
        Go to App
        <ArrowRight className="w-4 h-4" />
      </Button>
    </motion.div>
  );
}

/* ─── Main Onboarding Page ───────────────────────────────────────── */

function OnboardingContent() {
  const router = useRouter();
  const { safeAddress } = useAuth();
  const api = useApiClient();

  const [step, setStep] = useState(0);
  const [stepReady, setStepReady] = useState(false);
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const totalSteps = 3;

  // Restore step from localStorage on mount (once safeAddress is ready)
  useEffect(() => {
    if (!safeAddress) return;
    try {
      const raw = localStorage.getItem(`onboarding_${safeAddress}`);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.step === "number" && s.step >= 0 && s.step <= 2) {
          setStep(s.step);
        }
      }
    } catch {}
    setStepReady(true);
  }, [safeAddress]);

  const completeOnboarding = () => {
    if (!safeAddress) return;
    markOnboardingTelegramDone(safeAddress); // cache completed=true locally
    api.users.upsert({ safeAddress, onboardingCompleted: true }).catch(() => {});
    setStep(2);
  };

  const handleSkipAll = () => {
    if (!safeAddress) return;
    markAllOnboardingSkipped(safeAddress);
    api.users.upsert({ safeAddress, onboardingCompleted: true }).catch(() => {});
    setStep(2);
  };

  const handleSaveUsername = async (username: string) => {
    if (!safeAddress) throw new Error("Wallet not ready");
    await api.users.upsert({ safeAddress, username });
    markOnboardingUsernameSet(safeAddress);
    setSavedUsername(username);
    setStep(1);
  };

  const handleSkipUsername = () => {
    if (!safeAddress) return;
    markOnboardingUsernameSkipped(safeAddress);
    setStep(1);
  };

  const handleTelegramDone = () => completeOnboarding();

  const handleSkipTelegram = () => completeOnboarding();

  // Don't render steps until we've read the persisted step
  if (!stepReady) return null;

  return (
    <div className="min-h-screen hero-gradient text-white flex flex-col items-center justify-center px-4 relative">
      {/* Background grid */}
      <div className="absolute inset-0 grid-pattern opacity-40 pointer-events-none" />

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0.2 }}
        className="absolute top-8 left-1/2 -translate-x-1/2"
      >
        <div className="relative w-[160px] h-[64px]">
          <Image
            src="/brand-kit/Lockup.png"
            alt="Zhentan"
            fill
            className="object-contain drop-shadow-[0_0_28px_rgba(229,168,50,0.3)]"
            priority
            sizes="160px"
          />
        </div>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, type: "spring", bounce: 0.15 }}
        className="w-full max-w-sm glass-card p-8 flex flex-col items-center"
      >
        {/* Step indicator + skip-all button */}
        <div className="w-full flex items-center justify-between mb-8">
          <StepIndicator current={step} total={totalSteps} />
          {step < 2 && (
            <button
              onClick={handleSkipAll}
              className="flex items-center gap-1 text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
            >
              Skip setup
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          {step === 0 && (
            <UsernameStep
              onSave={handleSaveUsername}
              onSkip={handleSkipUsername}
            />
          )}
          {step === 1 && safeAddress && (
            <ConnectStep
              safeAddress={safeAddress}
              onFinish={handleTelegramDone}
              onSkip={handleSkipTelegram}
            />
          )}
          {step === 2 && <DoneStep username={savedUsername} />}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <AuthGuard>
      <OnboardingContent />
    </AuthGuard>
  );
}
