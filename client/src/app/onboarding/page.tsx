"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  KeyRound,
  Loader2,
  Minus,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/Button";
import { AuthGuard } from "@/components/AuthGuard";
import { useBackupCandidate } from "@/components/BackupAddressPicker";
import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/app/context/AuthContext";
import { useApiClient } from "@/lib/api/client";
import { useScreeningStatus } from "@/app/context/ScreeningStatusContext";
import { useTelegramLink } from "@/hooks/useTelegramLink";
import {
  markOnboardingWalletLinked,
  markOnboardingUsernameSkipped,
  markOnboardingUsernameSet,
  markOnboardingTelegramDone,
  readOnboardingStep,
} from "@/lib/useOnboarding";
import { queueTour } from "@/lib/tours";

/* ─── Progress header: step dashes + label ───────────────────────── */

function ProgressHeader({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-[7px] mb-6">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={clsx(
            "h-1 rounded-pill transition-all duration-300",
            i === step ? "w-[30px] bg-gold" : i < step ? "w-4 bg-gold/40" : "w-4 bg-foreground/10"
          )}
        />
      ))}
      <span className="flex-1" />
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
        Step {step + 1} of 4
      </span>
    </div>
  );
}

/* ─── Shared bits ─────────────────────────────────────────────────── */

function Tick({ selected }: { selected: boolean }) {
  return (
    <span
      className={clsx(
        "w-5 h-5 rounded-pill shrink-0 flex items-center justify-center mt-1.5 transition-all duration-200",
        selected ? "bg-gold" : "border-[1.5px] border-foreground/16"
      )}
    >
      {selected && <Check className="h-3 w-3 text-ink-900" strokeWidth={3.5} />}
    </span>
  );
}

const optionClass = (selected: boolean) =>
  clsx(
    "w-full text-left p-[15px] rounded-[18px] cursor-pointer transition-all duration-200 border",
    selected
      ? "border-gold/45 bg-gold/[0.075] hover:bg-gold/10"
      : "border-foreground/8 bg-foreground/[0.025] hover:bg-foreground/[0.045]"
  );

const segClass = (on: boolean) =>
  clsx(
    "flex-1 py-[9px] rounded-[11px] text-xs font-semibold transition-all duration-200 cursor-pointer",
    on ? "bg-gold/16 text-gold" : "text-muted-foreground hover:text-foreground"
  );

interface Cta {
  label: string;
  enabled: boolean;
  onClick: () => void;
}

function PrimaryCta({ cta }: { cta: Cta }) {
  return (
    <Button onClick={cta.onClick} disabled={!cta.enabled} className="w-full mt-4">
      {cta.label}
      {cta.enabled && <ArrowRight className="ml-2 h-4 w-4" />}
    </Button>
  );
}

/* ─── Step 1: Protection choice + override key ────────────────────── */

function ProtectionStep({ onContinue }: { onContinue: () => void }) {
  const {
    externalWalletAddress,
    setBackupAddress,
    backupAddressLocked,
    pendingProfile,
    setPendingProfile,
    safeAddress,
    safeLoading,
    safeConfig,
  } = useAuth();

  // Two screens: "protect" (screening choice) then "backup" (override key).
  // The end profile is wherever the user stops — each is a valid creation
  // profile and upgrades later never change the address.
  const [screen, setScreen] = useState<"protect" | "backup">("protect");
  const [mode, setMode] = useState<"connect" | "address">("connect");
  const [skipPanel, setSkipPanel] = useState(false);
  // Skipping through the warning panel IS the lockout-risk acknowledgment
  // (replaces the old consent checkbox).
  const [skipped, setSkipped] = useState(false);
  // Candidate confirmed via the primary CTA — auto-advance once the
  // protected derivation lands ("Use this key & create my vault" is one tap).
  const [advancePending, setAdvancePending] = useState(false);

  const cand = useBackupCandidate();

  // Readiness gates check the RESOLVED derivation (safeConfig.profile is
  // classified from the derived owner set), never just the pending inputs:
  // right after a choice changes, safeAddress/safeConfig still describe the
  // PREVIOUS derivation for a render or two — and the auto-advance effect
  // runs before the provider effect that flips safeLoading. Committing in
  // that window persists a row for the stale address (the duplicate-row bug).
  const derived = !!safeAddress && !safeLoading && !!safeConfig;
  const resolvedProfile = safeConfig?.profile ?? null;
  const guardedSelected = pendingProfile === "guarded" || pendingProfile === "protected";
  const starterSelected = pendingProfile === "starter";
  const starterReady = starterSelected && derived && resolvedProfile === "starter";
  const protectedReady =
    pendingProfile === "protected" &&
    !!externalWalletAddress &&
    derived &&
    resolvedProfile === "protected";
  const guardedReady =
    pendingProfile === "guarded" && derived && resolvedProfile === "guarded";

  useEffect(() => {
    if (advancePending && protectedReady) {
      setAdvancePending(false);
      onContinue();
    }
  }, [advancePending, protectedReady, onContinue]);

  // A backup key that already exists (resumed session, pre-linked wallet)
  // makes the wallet protected — without this the ready-gate can never pass.
  useEffect(() => {
    if (screen === "backup" && externalWalletAddress && pendingProfile === "guarded") {
      setPendingProfile("protected");
    }
  }, [screen, externalWalletAddress, pendingProfile, setPendingProfile]);

  const pickGuarded = () => {
    if (pendingProfile !== "protected") setPendingProfile("guarded");
  };
  const pickStarter = () => {
    setBackupAddress(null);
    setPendingProfile("starter");
  };

  const confirmCandidate = () => {
    if (!cand.candidate) return;
    setBackupAddress(cand.candidate.address);
    setPendingProfile("protected");
    cand.clearCandidate();
    setSkipped(false);
    setSkipPanel(false);
    setAdvancePending(true);
  };

  const clearBackup = () => {
    setBackupAddress(null);
    setPendingProfile("guarded");
  };

  const protectCta: Cta = !pendingProfile
    ? { label: "Choose an option", enabled: false, onClick: () => {} }
    : starterSelected
      ? starterReady
        ? { label: "Create my wallet", enabled: true, onClick: onContinue }
        : { label: "Creating your vault...", enabled: false, onClick: () => {} }
      : { label: "Turn on screening", enabled: true, onClick: () => setScreen("backup") };

  const creating: Cta = { label: "Creating your vault...", enabled: false, onClick: () => {} };
  const backupCta: Cta = cand.candidate
    ? { label: "Use this key & create my vault", enabled: true, onClick: confirmCandidate }
    : externalWalletAddress
      ? advancePending || !protectedReady
        ? creating
        : { label: "Create my vault", enabled: true, onClick: onContinue }
      : skipped
        ? guardedReady
          ? { label: "Create vault anyway", enabled: true, onClick: onContinue }
          : creating
        : { label: "Add a key", enabled: false, onClick: () => {} };

  return (
    <motion.div
      key="protection"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: "spring", bounce: 0.15 }}
      className="w-full"
    >
      {screen === "protect" ? (
        /* ── 1a: how should this wallet be protected? ── */
        <>
          <h2 className="text-[23px] font-bold tracking-tight mb-2">
            How should this wallet be protected?
          </h2>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground mb-5">
            Pick one now — you can switch anytime in Settings and your wallet
            address never changes.
          </p>

          <div className="flex flex-col gap-2.5">
            <button type="button" onClick={pickGuarded} className={optionClass(guardedSelected)}>
              <span className="flex items-start gap-3">
                <span className="w-[34px] h-[34px] rounded-xl shrink-0 flex items-center justify-center bg-gold/12">
                  <ShieldCheck className="h-[17px] w-[17px] text-gold" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14.5px] font-bold tracking-tight">AI screening on</span>
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] px-2 py-[3px] rounded-pill bg-gold/14 text-gold">
                      Recommended
                    </span>
                  </span>
                  <span className="block text-xs leading-relaxed text-muted-foreground mt-1">
                    Zhentan reviews and co-signs every transaction, catching
                    scams and mistakes before they land.
                  </span>
                </span>
                <Tick selected={guardedSelected} />
              </span>
            </button>

            <button type="button" onClick={pickStarter} className={optionClass(starterSelected)}>
              <span className="flex items-start gap-3">
                <span className="w-[34px] h-[34px] rounded-xl shrink-0 flex items-center justify-center bg-foreground/6">
                  <KeyRound className="h-[17px] w-[17px] text-muted-foreground" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-[14.5px] font-bold tracking-tight">Just my key</span>
                  <span className="block text-xs leading-relaxed text-muted-foreground mt-1">
                    A standard wallet with no screening. Zhentan still relays
                    your transactions gas-free.
                  </span>
                </span>
                <Tick selected={starterSelected} />
              </span>
            </button>
          </div>

          <PrimaryCta cta={protectCta} />
          {starterSelected && (
            <p className="text-[11px] leading-relaxed text-muted-foreground/60 text-center mt-3">
              Your vault address is minted on creation — adding protection
              later never changes it.
            </p>
          )}
        </>
      ) : (
        /* ── 1b: add the override key ── */
        <>
          <h2 className="text-[23px] font-bold tracking-tight mb-2">Add your override key</h2>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground mb-[18px]">
            A second wallet you control, so you can always move funds yourself
            at <span className="text-foreground/75">app.safe.global</span> — even
            if Zhentan is offline. It is never asked to sign during setup.
          </p>

          {externalWalletAddress ? (
            /* Saved override key */
            <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-safe/[0.07] border border-safe/20">
              <span className="w-[30px] h-[30px] rounded-[10px] shrink-0 flex items-center justify-center bg-safe/14">
                <Check className="h-[15px] w-[15px] text-safe" strokeWidth={2.6} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold">Override key set</span>
                <span className="block font-mono text-[11px] text-muted-foreground mt-0.5 truncate">
                  {externalWalletAddress}
                </span>
              </span>
              {!backupAddressLocked && (
                <button
                  type="button"
                  onClick={clearBackup}
                  className="shrink-0 p-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            !skipped && (
              <div>
                {/* Segmented: connect / enter address */}
                <div className="flex gap-1 p-1 rounded-[14px] bg-foreground/4 mb-3">
                  <button type="button" onClick={() => { setMode("connect"); cand.clearError(); }} className={segClass(mode === "connect")}>
                    Connect a wallet
                  </button>
                  <button type="button" onClick={() => setMode("address")} className={segClass(mode === "address")}>
                    Enter an address
                  </button>
                </div>

                {mode === "connect" ? (
                  <button
                    type="button"
                    onClick={cand.connect}
                    disabled={cand.connecting}
                    className="w-full flex items-center gap-3 text-left p-3.5 rounded-2xl border border-foreground/8 bg-foreground/[0.035] hover:bg-foreground/6 hover:border-foreground/14 transition-all duration-200 disabled:opacity-60 disabled:cursor-default cursor-pointer"
                  >
                    <span className="w-8 h-8 rounded-[10px] shrink-0 flex items-center justify-center bg-foreground/6">
                      {cand.connecting ? (
                        <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                      ) : (
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                    <span className="flex-1">
                      <span className="block text-[13.5px] font-semibold">Connect a wallet</span>
                      <span className="block text-[11.5px] text-muted-foreground mt-0.5">
                        {cand.connecting ? "Opening your wallet…" : "Read-only — no signature asked"}
                      </span>
                    </span>
                    <ChevronRight className="h-[15px] w-[15px] text-muted-foreground/80 shrink-0" />
                  </button>
                ) : (
                  <div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={cand.input}
                        onChange={(e) => cand.updateInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") cand.resolveInput();
                        }}
                        placeholder="0x address, name.eth or name.bnb"
                        spellCheck={false}
                        autoComplete="off"
                        className="flex-1 min-w-0 bg-foreground/4 border border-foreground/10 rounded-[13px] px-3.5 py-[11px] font-mono text-[12.5px] text-foreground placeholder:font-sans placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold/50"
                      />
                      <button
                        type="button"
                        onClick={cand.resolveInput}
                        disabled={cand.resolving || !cand.input.trim()}
                        className="shrink-0 px-[15px] rounded-[13px] border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/10 transition-colors disabled:opacity-45 disabled:cursor-default cursor-pointer"
                      >
                        {cand.resolving ? "Checking…" : "Use"}
                      </button>
                    </div>
                    {cand.error && (
                      <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-danger mt-2">
                        <AlertTriangle className="h-[13px] w-[13px] shrink-0 mt-0.5" />
                        {cand.error}
                      </p>
                    )}
                  </div>
                )}

                {/* Candidate preview — confirmed by the primary CTA below */}
                <AnimatePresence>
                  {cand.candidate && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="mt-3 p-3.5 rounded-2xl border border-gold/25 bg-gold/[0.06]"
                    >
                      <p className="text-[13px] font-semibold">
                        {cand.candidate.label ?? "Pasted address"}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground mt-1 break-all">
                        {cand.candidate.address}
                      </p>
                      <div className="flex items-start gap-2.5 mt-2.5">
                        <p className="flex-1 text-[11.5px] leading-relaxed text-muted-foreground/90">
                          Confirm you control this wallet. It becomes a permanent
                          owner of your vault and can&apos;t be swapped casually
                          later.
                        </p>
                        <button
                          type="button"
                          onClick={cand.clearCandidate}
                          className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          )}

          {/* Skip warning panel — accepting it acknowledges the lockout risk */}
          <AnimatePresence>
            {skipPanel && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-3 p-[15px] rounded-2xl bg-watch/[0.06] border border-watch/18"
              >
                <p className="flex items-center gap-2 text-[13px] font-semibold text-watch mb-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Continue without an override key?
                </p>
                <p className="text-xs leading-relaxed text-watch/85 mb-3">
                  Zhentan must co-sign every transaction. If its agent is ever
                  offline, your funds sit safe but wait. Adding a key later
                  takes one tap in Settings.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSkipped(true);
                      setSkipPanel(false);
                      cand.clearCandidate();
                    }}
                    className="flex-1 py-2.5 rounded-xl border border-watch/35 text-watch text-xs font-semibold hover:bg-watch/10 transition-colors cursor-pointer"
                  >
                    Skip for now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSkipPanel(false);
                      setSkipped(false);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-gold text-ink-900 text-xs font-bold hover:bg-gold/90 transition-colors cursor-pointer"
                  >
                    Add a key
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <PrimaryCta cta={backupCta} />

          {/* Finality note: the CTA below mints the address / locks the key */}
          {(cand.candidate || externalWalletAddress || skipped) && (
            <p className="text-[11px] leading-relaxed text-muted-foreground/60 text-center mt-3">
              {skipped && !cand.candidate && !externalWalletAddress
                ? "Your vault address is minted on creation — adding an override key later never changes it."
                : "Creating your vault makes this key a permanent owner — changing it later is an on-chain owner swap in Settings."}
            </p>
          )}

          <div className="flex items-center justify-between mt-3">
            <button
              type="button"
              onClick={() => setScreen("protect")}
              className="inline-flex items-center gap-1.5 py-1 text-xs text-muted-foreground/75 hover:text-foreground transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-[13px] w-[13px]" />
              Back
            </button>
            {!externalWalletAddress && !skipPanel && !skipped && (
              <button
                type="button"
                onClick={() => setSkipPanel(true)}
                className="py-1 text-xs text-muted-foreground/75 hover:text-foreground transition-colors cursor-pointer"
              >
                I&apos;ll add this later
              </button>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground/60 text-center mt-[18px]">
            With an override key your vault is a 2-of-3 Safe — your key, your
            override key, the screening agent. Any two move funds, so
            you&apos;re never locked out and Zhentan alone can never move a
            cent.
          </p>
        </>
      )}
    </motion.div>
  );
}

/* ─── Step 2: Claim username ─────────────────────────────────────── */

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
  const available = isValid && !taken && !checking;

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
          const ok = await api.users.checkUsername(clean);
          setTaken(!ok);
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

  const hint = error
    ? error
    : taken
      ? "That username is taken."
      : username.length > 0 && username.length < 3
        ? "At least 3 characters."
        : available
          ? `Available — friends can pay you at @${username}`
          : "";
  const hintColor = error || taken ? "text-danger" : available ? "text-safe" : "text-muted-foreground/80";

  return (
    <motion.div
      key="username"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: "spring", bounce: 0.15 }}
      className="w-full"
    >
      <h2 className="text-[23px] font-bold tracking-tight mb-2">Claim your username</h2>
      <p className="text-[13.5px] leading-relaxed text-muted-foreground mb-5">
        Friends can send to <span className="font-mono text-foreground/75">@you</span> instead
        of a 42-character address. Change it anytime.
      </p>

      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
          @
        </span>
        <input
          type="text"
          value={username}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="alextan"
          maxLength={20}
          spellCheck={false}
          className="w-full rounded-[15px] border border-foreground/10 bg-foreground/4 pl-[34px] pr-10 py-[13px] font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold/50"
        />
        {isValid && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 flex">
            {checking ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/80" />
            ) : taken ? (
              <X className="w-3.5 h-3.5 text-danger" strokeWidth={3} />
            ) : (
              <Check className="w-3.5 h-3.5 text-safe" strokeWidth={3} />
            )}
          </span>
        )}
      </div>
      <p className={clsx("text-[11.5px] mt-2 min-h-4", hintColor)}>{hint}</p>

      <Button onClick={handleSave} disabled={!available || saving} className="w-full mt-4">
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            Continue
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </Button>
      <button
        type="button"
        onClick={onSkip}
        className="w-full mt-2.5 py-1.5 text-xs text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer"
      >
        Skip for now
      </button>
    </motion.div>
  );
}

/* ─── Step 3: Telegram alerts ────────────────────────────────────── */

const TelegramIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

function ConnectStep({
  onFinish,
  onSkip,
}: {
  onFinish: () => void;
  onSkip: () => void;
}) {
  // One step (#134): open the bot chat, say hi, tap the secure link it sends
  // back. The server-truth binding is polled until it lands.
  const { linked, identity, waiting, unlinking, start, unlink } = useTelegramLink();
  const tgLabel = identity?.username
    ? `@${identity.username}`
    : identity?.name ?? (linked ? "Account linked" : null);

  const handleDisconnect = async () => {
    try {
      await unlink();
    } catch {
      // ignore — the row stays visibly linked and can be retried
    }
  };

  return (
    <motion.div
      key="connect"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: "spring", bounce: 0.15 }}
      className="w-full"
    >
      <h2 className="text-[23px] font-bold tracking-tight mb-2">Get alerts on Telegram</h2>
      <p className="text-[13.5px] leading-relaxed text-muted-foreground mb-5">
        Say hi to the Zhentan bot and it replies with your personal secure
        link — one tap and this chat can approve or reject from anywhere.
      </p>

      <AnimatePresence mode="wait">
        {linked ? (
          <motion.div
            key="connected"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: "spring", bounce: 0.1 }}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-safe/[0.07] border border-safe/20"
          >
            <span className="w-[34px] h-[34px] rounded-xl shrink-0 flex items-center justify-center bg-safe/14">
              <TelegramIcon className="h-[17px] w-[17px] text-safe" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-[13.5px] font-semibold">Telegram</span>
                <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] px-[7px] py-0.5 rounded-pill bg-safe/14 text-safe">
                  Connected
                </span>
              </span>
              <span className="block font-mono text-[11.5px] text-muted-foreground mt-1 truncate">
                {tgLabel}
              </span>
            </span>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={unlinking}
              className="shrink-0 p-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-60"
            >
              {unlinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Disconnect"}
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="disconnected"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: "spring", bounce: 0.1 }}
            type="button"
            onClick={start}
            className="w-full flex items-center gap-3 text-left p-3.5 rounded-2xl border border-foreground/8 bg-foreground/[0.035] hover:bg-foreground/6 hover:border-foreground/14 transition-all duration-200 disabled:opacity-60 disabled:cursor-default cursor-pointer"
          >
            <span className="w-[34px] h-[34px] rounded-xl shrink-0 flex items-center justify-center bg-foreground/6">
              {waiting ? (
                <Loader2 className="h-[17px] w-[17px] text-muted-foreground animate-spin" />
              ) : (
                <TelegramIcon className="h-[17px] w-[17px] text-muted-foreground" />
              )}
            </span>
            <span className="flex-1">
              <span className="block text-[13.5px] font-semibold">
                {waiting ? "Waiting for you to say hi…" : "Open the Zhentan bot"}
              </span>
              <span className="block text-[11.5px] text-muted-foreground mt-0.5">
                {waiting
                  ? "Send any message, then tap the link the bot sends back"
                  : "Say hi and tap the secure link it replies with"}
              </span>
            </span>
            <ChevronRight className="h-[15px] w-[15px] text-muted-foreground/80 shrink-0" />
          </motion.button>
        )}
      </AnimatePresence>

      <Button onClick={onFinish} className="w-full mt-4">
        Continue
        <ArrowRight className="w-4 h-4" />
      </Button>
      <button
        type="button"
        onClick={onSkip}
        className="w-full mt-2.5 py-1.5 text-xs text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer"
      >
        Skip for now
      </button>
    </motion.div>
  );
}

/* ─── Step 4: Done ───────────────────────────────────────────────── */

function DoneStep({
  screeningOn,
  backupSet,
  tgLinked,
  onFinish,
}: {
  screeningOn: boolean;
  backupSet: boolean;
  tgLinked: boolean;
  onFinish: () => Promise<void>;
}) {
  const [finishing, setFinishing] = useState(false);

  const handleGo = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await onFinish();
    } catch {
      setFinishing(false);
    }
  };

  const doneLine = !screeningOn
    ? "A standard wallet, ready to use. Turn on screening whenever you like."
    : backupSet
      ? "You're on a 2-of-3 Safe — fully protected and never locked out."
      : "Screening is on. Add an override key any time in Settings.";

  const rows = [
    {
      on: screeningOn,
      text: screeningOn
        ? "AI screening on — every transaction reviewed"
        : "Screening off — you sign, Zhentan relays gas-free",
    },
    {
      on: backupSet,
      text: backupSet
        ? "Override key set — move funds yourself anytime"
        : "No override key yet — add one in Settings",
    },
    {
      on: tgLinked,
      text: tgLinked ? "Telegram alerts on" : "Telegram not connected",
    },
  ];

  return (
    <motion.div
      key="done"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", bounce: 0.2 }}
      className="w-full text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.15, type: "spring", bounce: 0.4 }}
        className="w-[60px] h-[60px] mx-auto mt-1.5 mb-5 rounded-pill bg-gold flex items-center justify-center shadow-[0_0_44px_rgba(196,148,40,0.35)]"
      >
        <Check className="w-7 h-7 text-ink-900" strokeWidth={3.2} />
      </motion.div>

      <h2 className="text-[23px] font-bold tracking-tight mb-2">Your vault is ready</h2>
      <p className="text-[13.5px] leading-relaxed text-muted-foreground mb-5">{doneLine}</p>

      <div className="flex flex-col gap-px rounded-2xl overflow-hidden bg-foreground/6 text-left mb-5">
        {rows.map((r) => (
          <div key={r.text} className="flex items-center gap-2.5 px-3.5 py-3 bg-card">
            <span
              className={clsx(
                "w-5 h-5 rounded-pill shrink-0 flex items-center justify-center",
                r.on ? "bg-safe/14 text-safe" : "bg-foreground/6 text-muted-foreground/70"
              )}
            >
              {r.on ? (
                <Check className="h-3 w-3" strokeWidth={3} />
              ) : (
                <Minus className="h-3 w-3" strokeWidth={3} />
              )}
            </span>
            <span className="flex-1 text-xs text-foreground/80">{r.text}</span>
          </div>
        ))}
      </div>

      <Button onClick={handleGo} disabled={finishing} className="w-full">
        {finishing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Finishing...
          </>
        ) : (
          <>
            Go to my wallet
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </Button>
    </motion.div>
  );
}

/* ─── Main Onboarding Page ───────────────────────────────────────── */

function OnboardingContent() {
  const router = useRouter();
  const {
    safeAddress,
    safeConfig,
    safeLoading,
    wallet,
    commitSafe,
    recordOnboardingCompleted,
    refreshSafe,
    pendingProfile,
    externalWalletAddress,
  } = useAuth();
  const { telegramLinked } = useScreeningStatus();
  const api = useApiClient();

  const [step, setStep] = useState(0);
  const [stepReady, setStepReady] = useState(false);

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
    // so a failure here must not trap the user on this screen. The deploy also
    // backfills owners/derivation_version on the record — refetch once it
    // lands so a session holding an incomplete row heals without a reload.
    if (safeConfig) {
      api.safe
        .deploy(safeConfig.owners, safeConfig.threshold)
        .then(() => refreshSafe())
        .catch((err) => {
          console.error("Eager Safe deploy failed (will retry on first tx):", err);
        });
    }
    markOnboardingTelegramDone(wallet.address);
    // Queue the first-time tour for arrival on /home — TourLauncher consumes
    // this marker; it never infers "new user" from account state.
    queueTour("main");
    // The in-memory record still says onboarding_completed=false — refresh it
    // so record-driven consumers see completion without a full page load.
    refreshSafe();
    router.replace("/home");
  };

  // Don't render steps until we've read the persisted step
  if (!stepReady) return null;

  return (
    <div className="min-h-screen hero-gradient text-foreground flex flex-col items-center justify-center px-5 py-14">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0.2 }}
        className="mb-8"
      >
        <BrandMark size="xl" className="gap-3" glow priority />
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, type: "spring", bounce: 0.15 }}
        className="w-full max-w-[436px] rounded-[26px] bg-card border border-border shadow-[0_34px_80px_-50px_rgba(0,0,0,0.9)] p-[30px] pb-[26px]"
      >
        <ProgressHeader step={step} />

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
              onFinish={handleTelegramDone}
              onSkip={handleSkipTelegram}
            />
          )}
          {step === 3 && (
            <DoneStep
              screeningOn={(safeConfig?.profile ?? pendingProfile) !== "starter"}
              backupSet={!!externalWalletAddress}
              tgLinked={telegramLinked}
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
