"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { PrivyLoginButton } from "@/components/PrivyLoginButton";
import { ThemeLoader } from "@/components/ThemeLoader";
import { useAuth } from "@/app/context/AuthContext";

export default function LoginPage() {
  const { user, wallet, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && wallet) {
      router.replace("/app");
    }
  }, [loading, user, wallet, router]);

  // Don't render login UI if already authenticated (will redirect)
  if (loading || (user && wallet)) {
    return (
      <ThemeLoader
        variant="auth"
        message={user && wallet ? "Taking you home..." : "Loading Zhentan"}
        subtext="Securing your session"
      />
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen cosmic-bg starfield px-4 py-8 sm:py-12 safe-area-bottom">
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, type: "spring", bounce: 0.2 }}
        className="w-full max-w-md min-w-0"
      >
        <Card className="overflow-hidden text-center p-0">
          {/* Logo + copy */}
          <div className="relative p-8 flex flex-col gap-4 items-center">
            <div className="absolute inset-0 bg-gradient-to-b from-claw/10 via-transparent to-transparent pointer-events-none" />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, type: "spring", bounce: 0.35 }}
              className="relative w-full flex justify-center"
            >
              <div className="relative">
                <Image
                  src="/brand-kit/Lockup.png"
                  alt="Zhentan"
                  width={320}
                  height={128}
                  priority

                />
              </div>
            </motion.div>
            <div className="relative mt-6 w-full max-w-[280px] space-y-2 text-center">
              <p className="text-slate-400/90 text-xs sm:text-sm uppercase tracking-[0.28em] font-medium">
                Your onchain behavior, guarded
              </p>
            </div>
            {/* Login CTA */}
            <div className="flex flex-col items-center gap-2">
              <p className="text-slate-500 text-sm">
                - Sign in to get started -
              </p>
              <PrivyLoginButton />
            </div>
          </div>

        </Card>

        <p className="text-center text-xs text-slate-500 mt-6 uppercase tracking-[0.2em]">
          Built for individuals, DAOs, and treasuries to move value with confidence.
        </p>
      </motion.div>
    </div>
  );
}
