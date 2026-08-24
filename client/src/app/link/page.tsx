"use client";

/**
 * /link — the stable verification page for Telegram linking (#134).
 *
 * The bot hands an unlinked chat a personal URL (/link?code=…), and its
 * message also shows a short user code that can be typed here from any
 * device with a signed-in session (RFC 8628). The flow itself — identity
 * preview, consequence language, consented relink, atomic completion —
 * lives in TelegramLinkFlow, shared with the settings activation dialog.
 */
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/Button";
import { BrandMark } from "@/components/BrandMark";
import { TelegramLinkFlow } from "@/components/TelegramLinkFlow";
import { useAuth } from "@/app/context/AuthContext";

function LinkPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const urlCode = params.get("code") ?? "";
  const { user, loading: authLoading, safeAddress, safeLoading } = useAuth();
  const { login } = usePrivy();

  const authed = !authLoading && !!user && !safeLoading && !!safeAddress;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-5">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0.15 }}
        className="w-full max-w-[420px]"
      >
        <div className="flex justify-center mb-6">
          <BrandMark />
        </div>

        <div className="rounded-3xl border border-foreground/8 bg-foreground/[0.02] p-6">
          {!authed && !authLoading ? (
            <>
              <h1 className="text-[19px] font-bold tracking-tight mb-2">Connect Telegram</h1>
              <p className="text-[13.5px] leading-relaxed text-muted-foreground mb-5">
                Sign in to your Zhentan account to finish connecting this Telegram.
              </p>
              <Button onClick={() => login()} className="w-full">
                Sign in to continue
              </Button>
            </>
          ) : authLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-gold" />
            </div>
          ) : (
            <TelegramLinkFlow
              initialCredential={urlCode ? { code: urlCode } : null}
              doneAction={
                <Button onClick={() => router.push("/home")} className="w-full">
                  Open Zhentan
                </Button>
              }
            />
          )}
        </div>

        <p className="text-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60 mt-5">
          Secured by Safe · BNB Chain
        </p>
      </motion.div>
    </div>
  );
}

export default function LinkPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      }
    >
      <LinkPageInner />
    </Suspense>
  );
}
