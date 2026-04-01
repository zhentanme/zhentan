"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, AtSign, Check, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
  username,
  setUsername,
  onNext,
}: {
  username: string;
  setUsername: (v: string) => void;
  onNext: () => void;
}) {
  const isValid = username.trim().length >= 3;

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
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="johndoe"
            maxLength={20}
            className="w-full rounded-2xl bg-white/6 pl-9 pr-4 py-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:bg-white/8 transition-all"
          />
        </div>

        {username.length > 0 && username.length < 3 && (
          <p className="text-xs text-amber-400/80 pl-1">At least 3 characters</p>
        )}

        <Button onClick={onNext} disabled={!isValid} className="w-full">
          Continue
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
}

/* ─── Step 2: Connect Accounts ───────────────────────────────────── */

function ConnectStep({ onFinish }: { onFinish: () => void }) {
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [googleLinked, setGoogleLinked] = useState(false);

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

      <h2 className="text-2xl font-bold text-center mb-2">Connect your accounts</h2>
      <p className="text-sm text-muted-foreground text-center mb-8 max-w-xs">
        Get notified about transactions and manage your wallet from anywhere.
      </p>

      <div className="w-full max-w-xs space-y-3">
        {/* Telegram */}
        <button
          onClick={() => setTelegramLinked(!telegramLinked)}
          className={`w-full flex items-center gap-4 rounded-2xl px-5 py-4 transition-all duration-200 border ${
            telegramLinked
              ? "border-gold/30 bg-gold/8"
              : "border-white/8 bg-white/4 hover:bg-white/6 hover:border-white/12"
          }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              telegramLinked ? "bg-gold/15" : "bg-white/6"
            }`}
          >
            <svg className={`h-5 w-5 ${telegramLinked ? "text-gold" : "text-slate-400"}`} viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <span className={`text-sm font-semibold ${telegramLinked ? "text-gold" : "text-slate-200"}`}>
              Telegram
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review alerts & approve transactions
            </p>
          </div>
          <div
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
              telegramLinked
                ? "border-gold bg-gold"
                : "border-white/20 bg-transparent"
            }`}
          >
            {telegramLinked && <Check className="w-3.5 h-3.5 text-black" />}
          </div>
        </button>

        {/* Google */}
        <button
          onClick={() => setGoogleLinked(!googleLinked)}
          className={`w-full flex items-center gap-4 rounded-2xl px-5 py-4 transition-all duration-200 border ${
            googleLinked
              ? "border-gold/30 bg-gold/8"
              : "border-white/8 bg-white/4 hover:bg-white/6 hover:border-white/12"
          }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              googleLinked ? "bg-gold/15" : "bg-white/6"
            }`}
          >
            <svg className={`h-5 w-5 ${googleLinked ? "text-gold" : "text-slate-400"}`} viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <span className={`text-sm font-semibold ${googleLinked ? "text-gold" : "text-slate-200"}`}>
              Google
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Backup & recovery via your Google account
            </p>
          </div>
          <div
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
              googleLinked
                ? "border-gold bg-gold"
                : "border-white/20 bg-transparent"
            }`}
          >
            {googleLinked && <Check className="w-3.5 h-3.5 text-black" />}
          </div>
        </button>
      </div>

      <div className="w-full max-w-xs mt-6 space-y-3">
        <Button onClick={onFinish} className="w-full">
          {telegramLinked || googleLinked ? "Continue" : "Skip for now"}
          <ArrowRight className="w-4 h-4" />
        </Button>

        {!telegramLinked && !googleLinked && (
          <p className="text-[11px] text-muted-foreground/50 text-center">
            You can always connect these later in Settings
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Step 3: All Set ────────────────────────────────────────────── */

function DoneStep({ username }: { username: string }) {
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
      <p className="text-sm text-muted-foreground text-center mb-2">
        Welcome, <span className="text-gold font-semibold">{username}</span>
      </p>
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

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const totalSteps = 3;

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
        {/* Step indicator */}
        <div className="mb-8">
          <StepIndicator current={step} total={totalSteps} />
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          {step === 0 && (
            <UsernameStep
              username={username}
              setUsername={setUsername}
              onNext={() => setStep(1)}
            />
          )}
          {step === 1 && <ConnectStep onFinish={() => setStep(2)} />}
          {step === 2 && <DoneStep username={username} />}
        </AnimatePresence>
      </motion.div>


    </div>
  );
}
