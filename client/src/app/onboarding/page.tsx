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
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/Button";
import { AuthGuard } from "@/components/AuthGuard";
import { BackupAddressPicker } from "@/components/BackupAddressPicker";
import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/app/context/AuthContext";
import { useApiClient } from "@/lib/api/client";
import { useScreeningStatus } from "@/app/context/ScreeningStatusContext";
import { useTelegramLink } from "@/hooks/useTelegramLink";
import { useTelegramPhoto } from "@/hooks/useTelegramPhoto";
import { MaoAvatar } from "@/components/MaoAvatar";
import { TelegramLinkFlow } from "@/components/TelegramLinkFlow";
import {
  markOnboardingWalletLinked,
  markOnboardingUsernameSkipped,
  markOnboardingUsernameSet,
  markOnboardingTelegramDone,
  markOnboardingBackupDone,
  markOnboardingDone,
  readOnboardingStep,
} from "@/lib/useOnboarding";
import { useSafeTransitions } from "@/lib/useSafeUpgrade";
import { queueTour } from "@/lib/tours";

/* ─── Progress header: step dashes + label ───────────────────────── */

function ProgressHeader({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-[7px] mb-6">
      {[0, 1, 2, 3, 4].map((i) => (
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
        Step {step + 1} of 5
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

/** Repeated Safe-resolution failures (#136.4): stop pretending "Creating your
 *  vault..." is progress — say so, keep auto-retrying, offer a manual kick. */
function ResolutionErrorNote({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-3 p-3 rounded-2xl bg-danger/[0.06] border border-danger/20 flex items-start gap-2.5">
      <AlertTriangle className="h-3.5 w-3.5 text-danger shrink-0 mt-0.5" />
      <p className="flex-1 text-[11.5px] leading-relaxed text-danger/90">
        Can&apos;t reach Zhentan right now — retrying automatically. Your
        wallet isn&apos;t affected.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 text-[11.5px] font-semibold text-danger hover:opacity-80 transition-opacity cursor-pointer"
      >
        Try again
      </button>
    </div>
  );
}

const optionClass = (selected: boolean) =>
  clsx(
    "w-full text-left p-[15px] rounded-[18px] cursor-pointer transition-all duration-200 border",
    selected
      ? "border-gold/45 bg-gold/[0.075] hover:bg-gold/10"
      : "border-foreground/8 bg-foreground/[0.025] hover:bg-foreground/[0.045]"
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
    pendingProfile,
    setPendingProfile,
    setBackupAddress,
    safeAddress,
    safeLoading,
    safeError,
    safeConfig,
    refreshSafe,
    hasExistingWallet,
  } = useAuth();

  // ONE screen: the protection choice IS the creation. Choosing screening
  // creates the vault as GUARDED right away — Telegram (the screening
  // channel) comes next, and the backup key is added AFTER creation as an
  // on-chain upgrade (BackupStep). This is what lets Telegram precede the
  // backup flow: the address exists before either.
  const derived = !!safeAddress && !safeLoading && !!safeConfig;
  const resolvedProfile = safeConfig?.profile ?? null;

  // Returning signer with an abandoned earlier attempt: the record fixes the
  // address AND the profile — no selection can re-derive it. Freeze the
  // choice on the existing profile and let Continue proceed; without this,
  // picking a different profile waited forever on "Creating your vault..."
  // for a derivation the record-first resolution will never run.
  useEffect(() => {
    if (!hasExistingWallet || !resolvedProfile) return;
    if (
      (resolvedProfile === "starter" ||
        resolvedProfile === "guarded" ||
        resolvedProfile === "protected") &&
      pendingProfile !== resolvedProfile
    ) {
      setPendingProfile(resolvedProfile);
    }
  }, [hasExistingWallet, resolvedProfile, pendingProfile, setPendingProfile]);

  // "protected" appears here only for resumed legacy sessions — the option
  // itself now always creates guarded (backup key rides the later step).
  const guardedSelected = pendingProfile === "guarded" || pendingProfile === "protected";
  const starterSelected = pendingProfile === "starter";
  const starterReady = starterSelected && derived && resolvedProfile === "starter";
  const screeningReady =
    guardedSelected &&
    derived &&
    (resolvedProfile === "guarded" || resolvedProfile === "protected");

  const pickGuarded = () => {
    if (hasExistingWallet) return;
    setBackupAddress(null);
    setPendingProfile("guarded");
  };
  const pickStarter = () => {
    if (hasExistingWallet) return;
    setBackupAddress(null);
    setPendingProfile("starter");
  };

  const protectCta: Cta = hasExistingWallet
    ? derived
      ? { label: "Continue with my vault", enabled: true, onClick: onContinue }
      : { label: "Loading your vault...", enabled: false, onClick: () => {} }
    : !pendingProfile
      ? { label: "Choose an option", enabled: false, onClick: () => {} }
      : starterSelected
        ? starterReady
          ? { label: "Create my wallet", enabled: true, onClick: onContinue }
          : { label: "Creating your vault...", enabled: false, onClick: () => {} }
        : screeningReady
          ? { label: "Create my vault", enabled: true, onClick: onContinue }
          : { label: "Creating your vault...", enabled: false, onClick: () => {} };

  return (
    <motion.div
      key="protection"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: "spring", bounce: 0.15 }}
      className="w-full"
    >
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
      {safeError && <ResolutionErrorNote onRetry={refreshSafe} />}
      {hasExistingWallet ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/60 text-center mt-3">
          This wallet was already created with the protection shown above —
          its address never changes. You can adjust protection any time in
          Settings.
        </p>
      ) : guardedSelected ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/60 text-center mt-3">
          Next: connect Telegram for approvals, then add a backup key you
          control — your address never changes.
        </p>
      ) : (
        starterSelected && (
          <p className="text-[11px] leading-relaxed text-muted-foreground/60 text-center mt-3">
            Your vault address is minted on creation — adding protection
            later never changes it.
          </p>
        )
      )}
    </motion.div>
  );
}

/* ─── Step 3: Backup key (post-creation upgrade) ───────────────── */

function BackupStep({ onContinue }: { onContinue: () => void }) {
  // The vault already exists (created guarded) — adding the override key is
  // the guarded→protected TRANSITION: an owner-management SafeTx on the same
  // address, screened + auto-approved server-side. The Safe must be deployed
  // first (transitions execute on-chain), so the eager deploy fires on entry.
  const { safeConfig, externalWalletAddress, setBackupAddress, refreshSafe } = useAuth();
  const { addBackup, busy, error } = useSafeTransitions();
  const api = useApiClient();

  const [skipPanel, setSkipPanel] = useState(false);
  const [pendingUpgrade, setPendingUpgrade] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const deployStartedRef = useRef(false);

  const deployed = safeConfig?.deployed ?? false;
  useEffect(() => {
    if (deployed || deployStartedRef.current || !safeConfig) return;
    deployStartedRef.current = true;
    setDeployError(null);
    api.safe
      .deploy(safeConfig.owners, safeConfig.threshold)
      .then(() => refreshSafe())
      .catch((err) => {
        deployStartedRef.current = false;
        setDeployError(err instanceof Error ? err.message : "Deploy failed");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployed, safeConfig?.owners?.length]);

  const handleAdd = async () => {
    try {
      const result = await addBackup();
      if (result.pending) setPendingUpgrade(true);
      else onContinue();
    } catch {
      /* error surfaced by the hook */
    }
  };

  if (pendingUpgrade) {
    return (
      <motion.div
        key="backup-pending"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full flex flex-col items-center py-6 text-center"
      >
        <MaoAvatar state="thinking" size={56} />
        <h2 className="mt-4 text-[19px] font-bold tracking-tight">Adding your key</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground max-w-[300px]">
          The upgrade is signed and completes automatically in a moment — no
          need to wait here.
        </p>
        <Button onClick={onContinue} className="w-full mt-6">
          Continue
          <ArrowRight className="w-4 h-4" />
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="backup"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: "spring", bounce: 0.15 }}
      className="w-full"
    >
      <h2 className="text-[23px] font-bold tracking-tight mb-2">Add your override key</h2>
      <p className="text-[13.5px] leading-relaxed text-muted-foreground mb-[18px]">
        A second wallet you control, so you can always move funds yourself
        at <span className="text-foreground/75">app.safe.global</span> — even
        if Zhentan is offline. It is never asked to sign during setup.
      </p>

      {externalWalletAddress ? (
        <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-safe/[0.07] border border-safe/20">
          <span className="w-[30px] h-[30px] rounded-[10px] shrink-0 flex items-center justify-center bg-safe/14">
            <Check className="h-[15px] w-[15px] text-safe" strokeWidth={2.6} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-semibold">Override key</span>
            <span className="block font-mono text-[11px] text-muted-foreground mt-0.5 truncate">
              {externalWalletAddress}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setBackupAddress(null)}
            className="shrink-0 p-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Change
          </button>
        </div>
      ) : (
        !skipPanel && <BackupAddressPicker onSelect={setBackupAddress} />
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-danger mt-3">
          <AlertTriangle className="h-[13px] w-[13px] shrink-0 mt-0.5" />
          {error}
        </p>
      )}
      {deployError && (
        <div className="mt-3 p-3 rounded-2xl bg-danger/[0.06] border border-danger/20 flex items-start gap-2.5">
          <AlertTriangle className="h-3.5 w-3.5 text-danger shrink-0 mt-0.5" />
          <p className="flex-1 text-[11.5px] leading-relaxed text-danger/90">
            Couldn&apos;t put your vault on-chain yet — it retries on your
            first transaction too.
          </p>
          <button
            type="button"
            onClick={() => {
              deployStartedRef.current = false;
              setDeployError(null);
              refreshSafe();
            }}
            className="shrink-0 text-[11.5px] font-semibold text-danger hover:opacity-80 transition-opacity cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Skip warning — accepting it acknowledges the lockout risk */}
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
                onClick={onContinue}
                className="flex-1 py-2.5 rounded-xl border border-watch/35 text-watch text-xs font-semibold hover:bg-watch/10 transition-colors cursor-pointer"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={() => setSkipPanel(false)}
                className="flex-1 py-2.5 rounded-xl bg-gold text-ink-900 text-xs font-bold hover:bg-gold/90 transition-colors cursor-pointer"
              >
                Add a key
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {externalWalletAddress && (
        <Button onClick={handleAdd} disabled={busy || !deployed} className="w-full mt-4">
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Adding your key...
            </>
          ) : !deployed ? (
            "Preparing your vault..."
          ) : (
            <>
              Add key & upgrade
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      )}

      <div className="flex items-center justify-center mt-3">
        {!externalWalletAddress && !skipPanel && (
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
  // Availability lookup failed (network) — don't claim "Available" (#136.9);
  // the save itself still enforces uniqueness server-side.
  const [checkFailed, setCheckFailed] = useState(false);
  const api = useApiClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isValid = username.trim().length >= 3;
  const available = isValid && !taken && !checking;

  const handleChange = (val: string) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(clean);
    setError(null);
    setTaken(false);
    setCheckFailed(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (clean.length >= 3) {
      setChecking(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const ok = await api.users.checkUsername(clean);
          setTaken(!ok);
        } catch {
          setCheckFailed(true);
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
        : checkFailed && isValid
          ? "Couldn't check availability — you can still continue."
          : available
            ? `Available — friends can pay you at @${username}`
            : "";
  const hintColor =
    error || taken
      ? "text-danger"
      : available && !checkFailed
        ? "text-safe"
        : "text-muted-foreground/80";

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

function ConnectStep({ onFinish }: { onFinish: () => void }) {
  // One step (#134): open the bot chat, say hi, tap the secure link it sends
  // back. The step watches the server-truth binding the whole time it is on
  // screen, so a link completed from ANY device is picked up — the tap below
  // is a pure open-the-chat link.
  const { linked, identity, unlinking, openBot, setWatching, unlink } = useTelegramLink();
  // Guarded creations keep screening structurally ON (#136.1) — skipping
  // Telegram means reviews reach email + dashboard only. Say so at the skip.
  const { safeConfig, pendingProfile } = useAuth();
  const guardedCreation = (safeConfig?.profile ?? pendingProfile) === "guarded";
  const photoUrl = useTelegramPhoto({ enabled: linked });
  const [opened, setOpened] = useState(false);
  // Cross-device path (RFC 8628): type the bot's short code right here.
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const tgLabel = identity?.username
    ? `@${identity.username}`
    : identity?.name ?? (linked ? "Account linked" : null);

  useEffect(() => {
    setWatching(!linked);
    return () => setWatching(false);
  }, [linked, setWatching]);

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
            <span className="w-[34px] h-[34px] rounded-xl shrink-0 flex items-center justify-center bg-safe/14 overflow-hidden">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <MaoAvatar state="cleared" size={24} variant="solid" />
              )}
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
            onClick={() => {
              setOpened(true);
              openBot();
            }}
            className="w-full flex items-center gap-3 text-left p-3.5 rounded-2xl border border-foreground/8 bg-foreground/[0.035] hover:bg-foreground/6 hover:border-foreground/14 transition-all duration-200 disabled:opacity-60 disabled:cursor-default cursor-pointer"
          >
            <span className="w-[34px] h-[34px] rounded-xl shrink-0 flex items-center justify-center bg-foreground/6">
              {/* Mao is already on watch — the sweep across his shades IS the
                  listening state; no spinner needed. */}
              <MaoAvatar state="scanning" size={30} variant="detail" />
            </span>
            <span className="flex-1">
              <span className="block text-[13.5px] font-semibold">
                {opened ? "Waiting for you to say hi…" : "Open the Zhentan bot"}
              </span>
              <span className="block text-[11.5px] text-muted-foreground mt-0.5">
                {opened
                  ? "Send any message, then tap the link the bot sends back"
                  : "Say hi and tap the secure link it replies with"}
              </span>
            </span>
            <ChevronRight className="h-[15px] w-[15px] text-muted-foreground/80 shrink-0" />
          </motion.button>
        )}
      </AnimatePresence>

      {!linked &&
        (showCodeEntry ? (
          <div className="mt-3 p-3.5 rounded-2xl border border-foreground/8 bg-foreground/[0.035]">
            <TelegramLinkFlow variant="embedded" />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCodeEntry(true)}
            className="w-full text-[11px] text-muted-foreground/80 hover:text-gold leading-relaxed text-center mt-2.5 transition-colors cursor-pointer"
          >
            Got a code from Telegram?{" "}
            <span className="text-gold/90">Enter the short code here →</span>
          </button>
        ))}

      {!linked && guardedCreation && (
        <p className="text-[11px] leading-relaxed text-watch/90 text-center mt-3.5">
          Screening stays on either way — without Telegram, review alerts
          reach your email and dashboard only.
        </p>
      )}
      <Button onClick={onFinish} className={clsx("w-full", linked || guardedCreation ? "mt-3.5" : "mt-4")}>
        {linked ? "Continue" : "Continue without Telegram"}
        <ArrowRight className="w-4 h-4" />
      </Button>
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

  // Telegram directly follows the wallet-shape step (#136 follow-up): for
  // guarded creations it's the approval channel for the screening the user
  // just turned on — connecting it before anything else is the natural
  // continuation. (It cannot precede the backup screen: the binding and the
  // record are keyed by the Safe ADDRESS, which the backup key determines.)
  const handleTelegramDone = () => {
    if (!wallet?.address) return;
    markOnboardingTelegramDone(wallet.address);
    setStep(2);
  };

  const handleBackupDone = () => {
    if (!wallet?.address) return;
    markOnboardingBackupDone(wallet.address);
    setStep(3);
  };

  // The backup step is the guarded→protected upgrade — only guarded wallets
  // have it; starter (no agent) and already-protected resumes skip through.
  const resolvedProfile = safeConfig?.profile ?? null;
  useEffect(() => {
    if (step !== 2 || !stepReady || !wallet?.address) return;
    if (resolvedProfile && resolvedProfile !== "guarded") {
      markOnboardingBackupDone(wallet.address);
      setStep(3);
    }
  }, [step, stepReady, resolvedProfile, wallet?.address]);

  const handleSaveUsername = async (username: string) => {
    if (!safeAddress || !wallet?.address) throw new Error("Wallet not ready");
    await api.users.upsert({ safeAddress, username });
    markOnboardingUsernameSet(wallet.address);
    setStep(4);
  };

  const handleSkipUsername = () => {
    if (!wallet?.address) return;
    markOnboardingUsernameSkipped(wallet.address);
    setStep(4);
  };

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
    markOnboardingDone(wallet.address);
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
          {step === 1 && safeAddress && <ConnectStep onFinish={handleTelegramDone} />}
          {step === 2 && safeAddress && resolvedProfile === "guarded" && (
            <BackupStep onContinue={handleBackupDone} />
          )}
          {step === 3 && safeAddress && (
            <UsernameStep
              onSave={handleSaveUsername}
              onSkip={handleSkipUsername}
            />
          )}
          {(step === 1 || step === 2 || step === 3) && !safeAddress && (
            /* Resumed session still resolving the Safe — a visible wait state,
               not a blank card (the step-0 fallback effect handles the
               genuinely-missing case). */
            <motion.div
              key="connect-loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 py-10"
            >
              <MaoAvatar state="thinking" size={44} />
              <p className="text-xs text-muted-foreground">Preparing your vault…</p>
            </motion.div>
          )}
          {step === 4 && (
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
