"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ThemeLoader } from "./ThemeLoader";
import { useAuth } from "@/app/context/AuthContext";
import { useOnboarding } from "@/lib/useOnboarding";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, wallet, loading, safeAddress, safeLoading, telegramUserId } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const skipOnboardingCheck = pathname === "/onboarding";
  const { loading: onboardingLoading, complete } = useOnboarding(
    !loading && user && wallet && !skipOnboardingCheck ? safeAddress : null,
    telegramUserId
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
    return (
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
