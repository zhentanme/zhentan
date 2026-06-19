"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { TwinTick } from "@/components/BrandMark";
import { GuardianCard } from "@/components/GuardianCard";
import { ThemeLoader } from "@/components/ThemeLoader";
import { useAuth } from "@/app/context/AuthContext";
import { useOnboarding } from "@/lib/useOnboarding";
import { useLoginWithOAuth } from "@privy-io/react-auth";

export default function LoginPage() {
  const { user, wallet, loading, safeAddress, safeLoading, telegramUserId } = useAuth();
  const { initOAuth, loading: oauthLoading } = useLoginWithOAuth();
  const [signingInGoogle, setSigningInGoogle] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  const { loading: onboardingLoading, complete: onboardingComplete } = useOnboarding(
    !loading && user && wallet && !safeLoading ? safeAddress : null,
    telegramUserId
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (loading || !user || !wallet || safeLoading || onboardingLoading) return;
    router.replace(onboardingComplete ? "/home" : "/onboarding");
  }, [loading, user, wallet, safeLoading, onboardingLoading, onboardingComplete, router]);

  const handleGoogleLogin = async () => {
    try {
      setSigningInGoogle(true);
      await initOAuth({ provider: "google" });
    } catch (err) {
      console.error("Google login failed:", err);
      setSigningInGoogle(false);
    }
  };

  // Stay on the loader through the window where the session is authenticated but
  // safeAddress / onboarding status are still resolving — avoids a login flash.
  const hasSession = !!user && !!wallet;
  const routeReady = hasSession && !safeLoading && !onboardingLoading;
  const busy = signingInGoogle || oauthLoading;

  if (!mounted || loading || hasSession) {
    return (
      <ThemeLoader
        variant="auth"
        message={routeReady ? "Taking you home..." : "Loading Zhentan"}
        subtext="Securing your session"
      />
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground flex items-center justify-center">
      {/* Ambient gold glow */}
      <div
        className="absolute inset-[-10%] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 38%, rgba(196,148,40,0.16), transparent 55%), radial-gradient(ellipse at 18% 92%, rgba(196,148,40,0.05), transparent 55%)",
        }}
      />
      <div className="absolute inset-0 grid-pattern opacity-30 pointer-events-none" />

      <div className="relative z-10 w-full max-w-[1180px] px-6 py-14 sm:px-12 grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        {/* ── Left: copy + CTA ── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, type: "spring", bounce: 0.15 }}
        >
          {/* Agent-id badge */}
          <span className="inline-flex items-center gap-3 px-3.5 py-2 rounded-pill bg-gold/[0.06] border border-gold/20 font-mono text-[11px] tracking-[0.14em] uppercase text-gold-300">
            <span className="w-[18px] h-[18px] rounded-pill bg-gold/15 flex items-center justify-center p-0.5">
              <TwinTick size={13} halo="none" />
            </span>
            Agent · online
            <span className="w-1.5 h-1.5 rounded-pill bg-gold-400 animate-signal-pulse" />
          </span>

          <h1 className="mt-6 font-bold text-[40px] sm:text-5xl lg:text-6xl leading-[1.02] tracking-[-0.04em] max-w-[15ch] text-foreground">
            Welcome back.
            <br />
            <em className="not-italic font-medium text-gold-300">Zhentan</em> has been watching.
          </h1>

          <p className="mt-5 text-base sm:text-lg leading-relaxed text-muted-foreground max-w-[44ch]">
            Your wallet is under guard. Sign in to see what Zhentan has been
            screening while you were away.
          </p>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={busy}
            className="mt-8 inline-flex items-center gap-3 px-6 py-3.5 rounded-pill bg-gradient-to-br from-gold-light to-gold-500 text-ink-900 font-semibold text-[15px] shadow-[0_14px_40px_-18px_rgba(196,148,40,0.8)] hover:brightness-[1.05] active:translate-y-px transition disabled:opacity-60 disabled:cursor-default cursor-pointer"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden>
                  <path fill="#1a1205" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#1a1205" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#1a1205" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#1a1205" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </>
            )}
          </button>

          <div className="mt-7 flex items-center gap-3 font-mono text-[11px] tracking-[0.12em] uppercase text-muted-foreground/70">
            <span>Secured by Safe</span>
            <span aria-hidden>·</span>
            <span>NanoBot/Hermes on BNB Chain</span>
          </div>
        </motion.div>

        {/* ── Right: live readout guardian card (landing hero) ── */}
        <motion.div
          className="flex justify-center lg:justify-end"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.6, type: "spring", bounce: 0.12 }}
        >
          <GuardianCard />
        </motion.div>
      </div>
    </div>
  );
}
