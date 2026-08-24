"use client";

/**
 * /link — the account side of Telegram linking (#134).
 *
 * The bot hands an unlinked chat a personal URL (/link?code=…). This page
 * runs in an authenticated app session, shows WHICH Telegram is about to be
 * bound (the one point where a phished or mistyped binding can be caught by
 * a human), states the consequences, and completes the binding. Relinking a
 * Telegram away from another account demands an explicit, non-defaulted
 * confirmation — that is the one branch that degrades another account.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/Button";
import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/app/context/AuthContext";
import { useApiClient } from "@/lib/api/client";
import { useScreeningStatus } from "@/app/context/ScreeningStatusContext";
import type { LinkPreview } from "@/lib/api/telegram";

type Phase =
  | { kind: "loading" }
  | { kind: "no_code" }
  | { kind: "invalid" }
  | { kind: "confirm"; preview: Extract<LinkPreview, { status: "valid" }> }
  | { kind: "done"; already: boolean }
  | { kind: "error"; message: string };

function tgDisplay(tg: { username: string | null; name: string | null; userId: string }) {
  if (tg.username) return `@${tg.username}${tg.name ? ` (${tg.name})` : ""}`;
  return tg.name ?? `Telegram ID ${tg.userId}`;
}

function LinkPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const code = params.get("code") ?? "";
  const { user, loading: authLoading, safeAddress, safeLoading } = useAuth();
  const { login } = usePrivy();
  const api = useApiClient();
  const { refresh } = useScreeningStatus();

  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [relinkConfirmed, setRelinkConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const authed = !authLoading && !!user && !safeLoading && !!safeAddress;

  useEffect(() => {
    if (!code) {
      setPhase({ kind: "no_code" });
      return;
    }
    if (!authed) return;
    let cancelled = false;
    api.telegram
      .previewLink(code)
      .then((preview) => {
        if (cancelled) return;
        if (preview.status === "invalid_code") setPhase({ kind: "invalid" });
        else setPhase({ kind: "confirm", preview });
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: "error", message: "Could not check this link. Try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [code, authed, api]);

  const complete = useCallback(async () => {
    setSubmitting(true);
    try {
      const result = await api.telegram.completeLink(code, relinkConfirmed);
      switch (result.status) {
        case "linked":
        case "relinked":
          await refresh().catch(() => {});
          setPhase({ kind: "done", already: false });
          break;
        case "already_linked":
          setPhase({ kind: "done", already: true });
          break;
        case "invalid_code":
          setPhase({ kind: "invalid" });
          break;
        case "needs_relink_confirmation":
          // Preview raced a fresh binding — re-render with the consent gate.
          setPhase((p) =>
            p.kind === "confirm"
              ? { kind: "confirm", preview: { ...p.preview, relation: "linked_elsewhere" } }
              : p
          );
          break;
        case "conflict":
          setPhase({ kind: "error", message: "Someone completed a link for this Telegram at the same time. Message the bot for a fresh link." });
          break;
      }
    } catch {
      setPhase({ kind: "error", message: "Linking failed. Try again." });
    } finally {
      setSubmitting(false);
    }
  }, [api, code, relinkConfirmed, refresh]);

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
          {/* ── Needs sign-in ── */}
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
          ) : phase.kind === "loading" || authLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-gold" />
            </div>
          ) : phase.kind === "no_code" || phase.kind === "invalid" ? (
            <>
              <h1 className="text-[19px] font-bold tracking-tight mb-2">
                {phase.kind === "no_code" ? "Missing link code" : "Link expired"}
              </h1>
              <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                {phase.kind === "no_code"
                  ? "This page needs the personal link the Zhentan bot sends you."
                  : "This link was already used or has expired."}{" "}
                Message the bot on Telegram and it will send you a fresh one.
              </p>
            </>
          ) : phase.kind === "error" ? (
            <>
              <h1 className="text-[19px] font-bold tracking-tight mb-2">Something went wrong</h1>
              <p className="text-[13.5px] leading-relaxed text-muted-foreground">{phase.message}</p>
            </>
          ) : phase.kind === "done" ? (
            <div className="flex flex-col items-center text-center py-2">
              <span className="w-14 h-14 rounded-full bg-safe/15 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-7 w-7 text-safe" />
              </span>
              <h1 className="text-[19px] font-bold tracking-tight mb-2">
                {phase.already ? "Already connected" : "Telegram connected"}
              </h1>
              <p className="text-[13.5px] leading-relaxed text-muted-foreground mb-5">
                {phase.already
                  ? "This Telegram is already linked to your account — nothing to do."
                  : "You'll get transaction alerts in your chat and can approve or reject reviews from there."}
              </p>
              <Button onClick={() => router.push("/home")} className="w-full">
                Open Zhentan
              </Button>
            </div>
          ) : (
            /* ── Confirm (link or relink) ── */
            <>
              <h1 className="text-[19px] font-bold tracking-tight mb-2">Connect this Telegram?</h1>

              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-foreground/[0.035] border border-foreground/8 mb-4">
                <span className="w-[34px] h-[34px] rounded-xl shrink-0 flex items-center justify-center bg-gold/12">
                  <ShieldCheck className="h-[17px] w-[17px] text-gold" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold truncate">
                    {tgDisplay(phase.preview.telegram)}
                  </span>
                  <span className="block text-[11.5px] text-muted-foreground mt-0.5">
                    The Telegram account requesting this connection
                  </span>
                </span>
              </div>

              <p className="text-[13px] leading-relaxed text-muted-foreground mb-4">
                Once connected, this Telegram will <b className="text-foreground">receive alerts</b> for
                your account and can <b className="text-foreground">approve or reject transactions</b>{" "}
                that Zhentan flags for review. Only continue if this is your own chat — if you didn't
                ask the bot for this link, close this page.
              </p>

              {phase.preview.relation === "linked_elsewhere" && (
                <div className="rounded-2xl border border-watch/30 bg-watch/[0.06] p-3.5 mb-4">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-watch shrink-0 mt-0.5" />
                    <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                      <b className="text-foreground">
                        {tgDisplay(phase.preview.telegram)} is currently connected to a different
                        Zhentan account.
                      </b>{" "}
                      Relinking moves it here: it will stop receiving alerts and lose approval access
                      for the other account.
                    </p>
                  </div>
                  <label className="flex items-start gap-2.5 mt-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={relinkConfirmed}
                      onChange={(e) => setRelinkConfirmed(e.target.checked)}
                      className="mt-0.5 accent-[#c49428]"
                    />
                    <span className="text-[12.5px] leading-relaxed text-foreground">
                      I understand — disconnect it from the other account and link it to this one.
                    </span>
                  </label>
                </div>
              )}

              <Button
                onClick={complete}
                disabled={
                  submitting ||
                  (phase.preview.relation === "linked_elsewhere" && !relinkConfirmed)
                }
                className="w-full"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : phase.preview.relation === "linked_elsewhere" ? (
                  "Move connection to this account"
                ) : phase.preview.relation === "already_linked" ? (
                  "Confirm (already connected)"
                ) : (
                  "Connect Telegram"
                )}
              </Button>
            </>
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
