"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ThemeLoader } from "./ThemeLoader";
import { useAuth } from "@/app/context/AuthContext";
import { useOnboarding } from "@/lib/useOnboarding";
import { useScreeningStatus } from "@/app/context/ScreeningStatusContext";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, wallet, loading, safeAddress, safeLoading, safeError, recordOnboardingCompleted } =
    useAuth();
  const { telegramLinked } = useScreeningStatus();
  const pathname = usePathname();
  const router = useRouter();

  const skipOnboardingCheck = pathname === "/onboarding";
  const { loading: onboardingLoading, complete } = useOnboarding(
    {
      walletAddress: wallet?.address,
      safeAddress,
      ready: !loading && !!user && !!wallet && !safeLoading && !skipOnboardingCheck,
      recordOnboardingCompleted,
    },
    telegramLinked
  );

  useEffect(() => {
    if (loading) return;
    if (!user || !wallet) {
      router.replace("/login");
      return;
    }
    if (skipOnboardingCheck || safeLoading || onboardingLoading) return;
    if (!complete) {
      router.replace("/onboarding");
    }
  }, [loading, user, wallet, safeLoading, onboardingLoading, complete, skipOnboardingCheck, router]);

  if (loading || (!skipOnboardingCheck && (safeLoading || onboardingLoading))) {
    // Repeated resolution failures (#136.4): say so instead of pretending
    // this is a normal load. Retries keep running underneath.
    return safeError ? (
      <ThemeLoader
        variant="auth"
        message="Can't reach Zhentan"
        subtext="Connection trouble — retrying automatically"
      />
    ) : (
      <ThemeLoader
        variant="auth"
        message="Loading Zhentan"
        subtext="Securing your session"
      />
    );
  }

  if (!user || !wallet) return null;
  if (!skipOnboardingCheck && !complete) return null;

  return <>{children}</>;
}
