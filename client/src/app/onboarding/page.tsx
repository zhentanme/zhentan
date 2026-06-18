"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, AtSign, Check, MessageCircle, Loader2, X, XIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AuthGuard } from "@/components/AuthGuard";
import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/app/context/AuthContext";
import { useApiClient } from "@/lib/api/client";
import { useLinkAccount, usePrivy } from "@privy-io/react-auth";
import {
  markOnboardingUsernameSkipped,
  markOnboardingUsernameSet,
  markOnboardingTelegramDone,
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
              : "w-4 bg-foreground/10"
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
  const [checking, setChecking] = useState(false);
  const [taken, setTaken] = useState(false);
  const api = useApiClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isValid = username.trim().length >= 3;

  const handleChange = (val: string) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(clean);
    setError(null);
    setTaken(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (clean.length >= 3) {
      setChecking(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const available = await api.users.checkUsername(clean);
          setTaken(!available);
        } catch {
          setTaken(false);
        } finally {
          setChecking(false);
        }
      }, 400);
    } else {
      setChecking(false);
    }
  };

  const handleSave = async () => {
    if (!isValid || taken || checking) return;
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
            onChange={(e) => handleChange(e.target.value)}
            placeholder="johndoe"
            maxLength={20}
            className="w-full rounded-2xl bg-foreground/6 pl-9 pr-10 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:bg-foreground/8 transition-all"
          />
          {isValid && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2">
              {checking ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/80" />
              ) : taken ? (
                <X className="w-3.5 h-3.5 text-danger" />
              ) : (
                <Check className="w-3.5 h-3.5 text-safe" />
              )}
            </span>
          )}
        </div>

        {username.length > 0 && username.length < 3 && (
          <p className="text-xs text-watch/80 pl-1">At least 3 characters</p>
        )}
        {taken && <p className="text-xs text-danger pl-1">Username already taken</p>}
        {error && <p className="text-xs text-danger pl-1">{error}</p>}

        <Button onClick={handleSave} disabled={!isValid || saving || taken || checking} className="w-full">
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
                className="w-full flex items-center gap-4 rounded-2xl px-5 py-4 border border-foreground/8 bg-foreground/4 hover:bg-foreground/6 hover:border-foreground/12 transition-all duration-200 disabled:opacity-60 disabled:cursor-default"
              >
                <div className="w-10 h-10 rounded-xl bg-foreground/6 flex items-center justify-center shrink-0">
                  {linking
                    ? <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                    : <TelegramIcon className="h-5 w-5 text-muted-foreground" />
                  }
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-foreground">Connect Telegram</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {linking ? "Opening Telegram..." : "Review alerts & approve transactions"}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/80 shrink-0" />
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
              <div className="flex flex-row justify-between items-center gap-4 rounded-2xl px-5 py-4 border border-foreground/8 bg-foreground/4">
                <div className="w-10 h-10 rounded-xl bg-foreground/6 flex items-center justify-center shrink-0">
                  <TelegramIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">Telegram</p>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-safe/15 text-safe">
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
                className="flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground/80 hover:text-danger transition-colors"
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

function DoneStep({
  username,
  socialName,
  onFinish,
}: {
  username: string | null;
  socialName: string | null;
  onFinish: () => Promise<void>;
}) {
  const [finishing, setFinishing] = useState(false);
  const displayName = socialName?.trim() || username;

  const handleGo = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await onFinish();
    } catch {
      setFinishing(false);
    }
  };

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
        className="w-16 h-16 rounded-full bg-gold flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(196,148,40,0.3)]"
      >
        <Check className="w-8 h-8 text-black" />
      </motion.div>

      <h2 className="text-2xl font-bold text-center mb-2">You're all set!</h2>
      {displayName && (
        <p className="text-sm text-muted-foreground text-center mb-2">
          Welcome, <span className="text-gold font-semibold capitalize">{displayName}</span>
        </p>
      )}
      <p className="text-xs text-muted-foreground/60 text-center max-w-xs mb-8">
        Your AI-secured wallet is ready. Every transaction will be screened and
        protected by Zhentan.
      </p>

      <Button onClick={handleGo} disabled={finishing} className="w-full max-w-xs">
        {finishing ? (
          <><Loader2 className="w-4 h-4 animate-spin" />Finishing...</>
        ) : (
          <>Go to App <ArrowRight className="w-4 h-4" /></>
        )}
      </Button>
    </motion.div>
  );
}

/* ─── Main Onboarding Page ───────────────────────────────────────── */

function OnboardingContent() {
  const router = useRouter();
  const { safeAddress, user } = useAuth();
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

  const handleTelegramDone = () => setStep(2);

  const handleSkipTelegram = () => setStep(2);

  const handleFinish = async () => {
    if (!safeAddress) return;
    // Persist on the server first — we want onboarding_completed set even if the
    // user never returns to this tab. Client-side flags and navigation follow.
    await api.users.upsert({ safeAddress, onboardingCompleted: true });
    markOnboardingTelegramDone(safeAddress);
    router.replace("/home");
  };

  // Don't render steps until we've read the persisted step
  if (!stepReady) return null;

  return (
    <div className="min-h-screen hero-gradient text-foreground flex flex-col items-center justify-center px-4 relative">
      {/* Background grid */}
      <div className="absolute inset-0 grid-pattern opacity-40 pointer-events-none" />

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0.2 }}
        className="absolute top-8 left-1/2 -translate-x-1/2"
      >
        <BrandMark size="xl" className="gap-3" glow priority />
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, type: "spring", bounce: 0.15 }}
        className="w-full max-w-sm glass-card p-8 flex flex-col items-center"
      >
        {/* Step indicator + skip-all button */}
        <div className="w-full flex items-center justify-center mb-8">
          <StepIndicator current={step} total={totalSteps} />
          
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
          {step === 2 && (
            <DoneStep
              username={savedUsername}
              socialName={user?.name ?? null}
              onFinish={handleFinish}
            />
          )}
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
