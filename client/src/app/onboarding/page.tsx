"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, AtSign, Check, KeyRound, MessageCircle, Loader2, ShieldCheck, X, XIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AuthGuard } from "@/components/AuthGuard";
import { BackupAddressPicker } from "@/components/BackupAddressPicker";
import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/app/context/AuthContext";
import { useApiClient } from "@/lib/api/client";
import { useLinkAccount, usePrivy } from "@privy-io/react-auth";
import {
  markOnboardingWalletLinked,
  markOnboardingUsernameSkipped,
  markOnboardingUsernameSet,
  markOnboardingTelegramDone,
  readOnboardingStep,
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

/* ─── Step 1: Gradual protection (add agent → add backup key) ─────── */

function ProtectionStep({ onContinue }: { onContinue: () => void }) {
  const {
    externalWalletAddress,
    setBackupAddress,
    backupAddressLocked,
    pendingProfile,
    setPendingProfile,
    safeAddress,
    safeLoading,
  } = useAuth();
  // Two screens: "agent" (add screening → guarded, or skip → starter), then
  // "backup" (add a backup key → protected, or skip → stay guarded). The end
  // profile is wherever the user stops — each is a valid creation profile and
  // upgrades later never change the address.
  const [screen, setScreen] = useState<"agent" | "backup">("agent");
  const [guardedAgreed, setGuardedAgreed] = useState(false);

  const derived = !!safeAddress && !safeLoading;
  const starterReady = pendingProfile === "starter" && derived;
  const guardedReady = pendingProfile === "guarded" && guardedAgreed && derived;
  const protectedReady =
    pendingProfile === "protected" && !!externalWalletAddress && derived;

  const chooseAgent = () => {
    setPendingProfile("guarded");
    setScreen("backup");
  };
  const chooseStarter = () => setPendingProfile("starter");
  const chooseBackup = (addr: string) => {
    setBackupAddress(addr);
    setPendingProfile("protected");
  };
  const clearBackup = () => {
    setBackupAddress(null);
    setPendingProfile("guarded");
  };
  const backToAgent = () => {
    setScreen("agent");
    setBackupAddress(null);
    setGuardedAgreed(false);
    setPendingProfile(null);
  };

  return (
    <motion.div
      key="protection"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: "spring", bounce: 0.15 }}
      className="flex flex-col items-center w-full"
    >
      {screen === "agent" ? (
        /* ── Screen 1: add the screening agent? ── */
        <>
          <div className="w-14 h-14 rounded-2xl bg-gold/10 flex items-center justify-center mb-6">
            <ShieldCheck className="w-7 h-7 text-gold" />
          </div>

          <h2 className="text-2xl font-bold text-center mb-2">Add AI screening?</h2>
          <p className="text-sm text-muted-foreground text-center mb-6 max-w-xs">
            Zhentan reviews every transaction before it executes — catching
            scams and mistakes. Add it now or anytime later; your address never
            changes.
          </p>

          <div className="w-full max-w-xs space-y-3">
            <button
              onClick={chooseAgent}
              className="w-full text-left rounded-2xl px-5 py-4 border border-gold/25 bg-gold/[0.06] hover:bg-gold/[0.09] hover:border-gold/40 transition-all duration-200"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-gold shrink-0" />
                <p className="text-sm font-semibold text-foreground">
                  Add the screening agent
                </p>
                <span className="px-2 py-0.5 rounded-pill bg-gold/12 text-gold text-[10px] font-mono uppercase tracking-wider">
                  Recommended
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Zhentan reviews and co-signs every transaction.
              </p>
            </button>

            <button
              onClick={chooseStarter}
              className={`w-full text-left rounded-2xl px-5 py-4 border transition-all duration-200 ${
                pendingProfile === "starter"
                  ? "border-gold/40 bg-foreground/6"
                  : "border-foreground/8 bg-foreground/4 hover:bg-foreground/6 hover:border-foreground/15"
              }`}
            >
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-sm font-semibold text-foreground">
                  Just my key for now
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                A standard wallet, no screening. Turn it on later in a tap.
              </p>
            </button>

            {pendingProfile === "starter" && (
              <>
                <p className="text-[11px] text-muted-foreground/80 leading-relaxed rounded-xl p-3.5 bg-foreground/4 border border-foreground/8">
                  No screening — transactions execute with just your signature.
                  Zhentan relays them gas-free but never co-signs.
                </p>
                <Button onClick={onContinue} disabled={!starterReady} className="w-full">
                  {starterReady ? "Continue" : "Creating your vault..."}
                  {starterReady && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
              </>
            )}
          </div>
        </>
      ) : (
        /* ── Screen 2: add a backup key? ── */
        <>
          <div className="w-14 h-14 rounded-2xl bg-gold/10 flex items-center justify-center mb-6">
            <KeyRound className="w-7 h-7 text-gold" />
          </div>

          <h2 className="text-2xl font-bold text-center mb-2">Add a backup key?</h2>
          <p className="text-sm text-muted-foreground text-center mb-6 max-w-xs">
            A second key you control — your override. With it you can always move
            funds yourself at app.safe.global, even if Zhentan is ever offline.
          </p>

          <div className="w-full max-w-xs space-y-3">
            {!externalWalletAddress ? (
              <BackupAddressPicker onSelect={chooseBackup} />
            ) : (
              <div className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 border border-safe/25 bg-safe/6">
                <Check className="h-4 w-4 text-safe shrink-0" />
                <p className="text-xs text-muted-foreground font-mono truncate flex-1">
                  {externalWalletAddress}
                </p>
                {!backupAddressLocked && (
                  <button
                    onClick={clearBackup}
                    className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Change
                  </button>
                )}
              </div>
            )}

            {externalWalletAddress ? (
              <Button onClick={onContinue} disabled={!protectedReady} className="w-full">
                {protectedReady ? "Continue" : "Creating your vault..."}
                {protectedReady && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            ) : (
              <div className="space-y-2.5 pt-1">
                <label className="flex items-start gap-2.5 rounded-xl p-3.5 bg-watch/[0.07] border border-watch/15 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={guardedAgreed}
                    onChange={(e) => setGuardedAgreed(e.target.checked)}
                    className="mt-0.5 accent-gold"
                  />
                  <span className="text-[11px] text-watch/90 leading-relaxed">
                    I understand that without a backup key, Zhentan must approve
                    every transaction — and if its agent is ever offline, my
                    funds wait until I add one. I can add a backup key anytime.
                  </span>
                </label>
                <button
                  onClick={onContinue}
                  disabled={!guardedReady}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-2 transition-colors disabled:opacity-50 disabled:cursor-default"
                >
                  {guardedReady
                    ? "Continue without a backup key"
                    : guardedAgreed
                    ? "Creating your vault..."
                    : "Continue without a backup key"}
                </button>
              </div>
            )}

            <button
              onClick={backToAgent}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground py-1.5 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
          </div>
        </>
      )}

      <p className="mt-6 text-[11px] text-muted-foreground/70 text-center leading-relaxed max-w-xs">
        Full protection is a 2-of-3 Safe: your key, your backup key, and the
        screening agent. Any two signatures move funds — you&apos;re never locked
        out, and Zhentan alone can never move a cent.
      </p>
    </motion.div>
  );
}

/* ─── Step 2: Choose Username ────────────────────────────────────── */

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
  const { safeAddress, safeConfig, safeLoading, wallet, user, commitSafe, recordOnboardingCompleted } = useAuth();
  const api = useApiClient();

  const [step, setStep] = useState(0);
  const [stepReady, setStepReady] = useState(false);
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const totalSteps = 4;

  // Already onboarded (per the backend record) → forward to the app. Without
  // this, a completed user who lands on /onboarding (a stale deep-link, a
  // back-nav) is stranded on the final step with no automatic way out.
  useEffect(() => {
    if (recordOnboardingCompleted === true) router.replace("/home");
  }, [recordOnboardingCompleted, router]);

  // Restore step from localStorage on mount. Keyed by the embedded wallet —
  // the Safe address doesn't exist until the backup key is linked (step 0).
  useEffect(() => {
    if (!wallet?.address) return;
    setStep(readOnboardingStep(wallet.address));
    setStepReady(true);
  }, [wallet?.address]);

  // A restored step past 0 is only valid once the Safe resolves — without a
  // backup key there is no Safe address, so send the user back to step 0.
  useEffect(() => {
    if (!stepReady || safeLoading) return;
    if (step > 0 && !safeAddress) setStep(0);
  }, [stepReady, safeLoading, step, safeAddress]);

  const handleBackupKeyDone = () => {
    if (!wallet?.address) return;
    // Locks in the backup key: allows the user record (owner set + address)
    // to persist. Before this, the choice is freely changeable.
    commitSafe();
    markOnboardingWalletLinked(wallet.address);
    setStep(1);
  };

  const handleSaveUsername = async (username: string) => {
    if (!safeAddress || !wallet?.address) throw new Error("Wallet not ready");
    await api.users.upsert({ safeAddress, username });
    markOnboardingUsernameSet(wallet.address);
    setSavedUsername(username);
    setStep(2);
  };

  const handleSkipUsername = () => {
    if (!wallet?.address) return;
    markOnboardingUsernameSkipped(wallet.address);
    setStep(2);
  };

  const handleTelegramDone = () => setStep(3);

  const handleSkipTelegram = () => setStep(3);

  const handleFinish = async () => {
    if (!safeAddress || !wallet?.address) return;
    // Persist on the server first — we want onboarding_completed set even if the
    // user never returns to this tab. Client-side flags and navigation follow.
    // Stamp signerAddress here too: it's the key `/users/by-signer` finds this
    // account by, and this write always runs on completion — so the row can
    // never be left with a null signer_address (which would make a returning
    // user look new and bounce them into onboarding).
    await api.users.upsert({
      safeAddress,
      signerAddress: wallet.address,
      onboardingCompleted: true,
    });
    // Eager deploy: the Safe must exist on-chain for app.safe.global and the
    // Transaction Service. Agent pays gas; /queue re-checks as a fallback,
    // so a failure here must not trap the user on this screen.
    if (safeConfig) {
      api.safe.deploy(safeConfig.owners, safeConfig.threshold).catch((err) => {
        console.error("Eager Safe deploy failed (will retry on first tx):", err);
      });
    }
    markOnboardingTelegramDone(wallet.address);
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
          {step === 0 && <ProtectionStep onContinue={handleBackupKeyDone} />}
          {step === 1 && (
            <UsernameStep
              onSave={handleSaveUsername}
              onSkip={handleSkipUsername}
            />
          )}
          {step === 2 && safeAddress && (
            <ConnectStep
              safeAddress={safeAddress}
              onFinish={handleTelegramDone}
              onSkip={handleSkipTelegram}
            />
          )}
          {step === 3 && (
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
