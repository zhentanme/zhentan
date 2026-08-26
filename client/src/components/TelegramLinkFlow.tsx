"use client";

/**
 * The account side of Telegram linking (#134), shared by the /link page and
 * the settings activation dialog: code entry (RFC 8628 typed user code or a
 * deep-linked long code) → identity preview (handle + photo — the one point
 * where a phished or mistyped binding can be caught by a human) → consequence
 * language → atomic completion. Relinking a Telegram away from another
 * account demands an explicit, non-defaulted confirmation.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { InlineError } from "./ui/InlineError";
import { Button } from "@/components/ui/Button";
import { MaoAvatar } from "@/components/MaoAvatar";
import { useApiClient } from "@/lib/api/client";
import { useScreeningStatus } from "@/app/context/ScreeningStatusContext";
import { useTelegramPhoto } from "@/hooks/useTelegramPhoto";
import type { LinkCredential, LinkPreview } from "@/lib/api/telegram";

type Phase =
  | { kind: "loading" }
  /** Cross-device path (RFC 8628): type the short code the bot showed. */
  | { kind: "enter"; error?: string }
  | { kind: "invalid" }
  | { kind: "confirm"; preview: Extract<LinkPreview, { status: "valid" }> }
  | { kind: "done"; already: boolean }
  | { kind: "error"; message: string };

function tgDisplay(tg: { username: string | null; name: string | null; userId: string }) {
  if (tg.username) return `@${tg.username}${tg.name ? ` (${tg.name})` : ""}`;
  return tg.name ?? `Telegram ID ${tg.userId}`;
}

export function TelegramLinkFlow({
  initialCredential = null,
  variant = "page",
  doneAction,
}: {
  /** Deep-linked long code (the /link?code=… path); null starts at entry. */
  initialCredential?: LinkCredential | null;
  variant?: "page" | "embedded";
  /** Rendered under the "connected" message (e.g. the page's Open-app button). */
  doneAction?: ReactNode;
}) {
  const api = useApiClient();
  const { refresh } = useScreeningStatus();
  const embedded = variant === "embedded";

  const [credential, setCredential] = useState<LinkCredential | null>(initialCredential);
  const [entryValue, setEntryValue] = useState("");
  const [phase, setPhase] = useState<Phase>(
    initialCredential ? { kind: "loading" } : { kind: "enter" }
  );
  const [relinkConfirmed, setRelinkConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const photoUrl = useTelegramPhoto({ credential, enabled: phase.kind === "confirm" });

  useEffect(() => {
    if (!credential) return;
    let cancelled = false;
    setPhase({ kind: "loading" });
    api.telegram
      .previewLink(credential)
      .then((preview) => {
        if (cancelled) return;
        if (preview.status === "invalid_code") {
          // A typed code returns to the form; a dead deep link is terminal.
          if ("userCode" in credential) {
            setCredential(null);
            setPhase({ kind: "enter", error: "That code isn't valid any more — check it, or message the bot for a fresh one." });
          } else {
            setPhase({ kind: "invalid" });
          }
        } else if (preview.status === "rate_limited") {
          setCredential(null);
          setPhase({ kind: "enter", error: "Too many attempts — wait a few minutes, then try again." });
        } else {
          setPhase({ kind: "confirm", preview });
        }
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: "error", message: "Could not check this link. Try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [credential, api]);

  const submitEntry = useCallback(() => {
    const cleaned = entryValue.toUpperCase().replace(/[^A-Z]/g, "");
    if (cleaned.length !== 8) {
      setPhase({ kind: "enter", error: "The code is 8 letters, like BDWK-QPXT." });
      return;
    }
    setCredential({ userCode: cleaned });
  }, [entryValue]);

  const complete = useCallback(async () => {
    if (!credential) return;
    setSubmitting(true);
    try {
      const result = await api.telegram.completeLink(credential, relinkConfirmed);
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
          if ("userCode" in credential) {
            setCredential(null);
            setPhase({ kind: "enter", error: "That code expired — message the bot for a fresh one." });
          } else {
            setPhase({ kind: "invalid" });
          }
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
  }, [api, credential, relinkConfirmed, refresh]);

  const heading = (text: string) =>
    embedded ? (
      <h4 className="text-sm font-semibold tracking-tight mb-1.5">{text}</h4>
    ) : (
      <h1 className="text-lg font-semibold tracking-tight mb-2">{text}</h1>
    );
  const bodyText = embedded
    ? "text-[12px] leading-relaxed text-muted-foreground"
    : "text-[13.5px] leading-relaxed text-muted-foreground";

  if (phase.kind === "loading") {
    // The loader is Mao weighing the code — dots pulsing in the glass.
    return (
      <div className={`flex flex-col items-center gap-2 ${embedded ? "py-4" : "py-8"}`}>
        <MaoAvatar state="thinking" size={embedded ? 44 : 64} />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
          Checking code
        </span>
      </div>
    );
  }

  if (phase.kind === "enter") {
    return (
      <>
        {!embedded && (
          <div className="flex justify-center mb-4">
            {/* Mao is waiting on YOUR code — ?? in the lenses. */}
            <MaoAvatar state="asking" size={64} interactive ambient={["tilt", "perk", "glint", "ear-flick"]} />
          </div>
        )}
        {!embedded && heading("Connect Telegram")}
        <p className={`${bodyText} ${embedded ? "mb-3" : "mb-5"}`}>
          Enter the code the bot showed you. No code? Message the bot on
          Telegram.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitEntry();
          }}
        >
          <input
            value={entryValue}
            onChange={(e) => setEntryValue(e.target.value.toUpperCase())}
            placeholder="BDWK-QPXT"
            autoFocus
            autoComplete="one-time-code"
            spellCheck={false}
            maxLength={9}
            className={`w-full text-center font-mono ${embedded ? "text-[17px]" : "text-[22px]"} tracking-[0.25em] uppercase rounded-md border border-foreground/10 bg-foreground/[0.035] px-4 ${embedded ? "py-2.5" : "py-3.5"} mb-3 outline-none focus:ring-2 focus:ring-gold/40 placeholder:text-muted-foreground/30`}
          />
          {phase.error && <InlineError className="mb-3">{phase.error}</InlineError>}
          <Button type="submit" className="w-full" disabled={!entryValue.trim()}>
            Continue
          </Button>
        </form>
      </>
    );
  }

  if (phase.kind === "invalid") {
    return (
      <>
        <div className={`flex ${embedded ? "" : "justify-center"} mb-3`}>
          {/* The link fell asleep — benign, not alarming. */}
          <MaoAvatar state="resting" size={embedded ? 40 : 56} />
        </div>
        {heading("Link expired")}
        <p className={`${bodyText} mb-4`}>
          Already used or expired. Message the bot for a fresh one.
        </p>
        <button
          type="button"
          onClick={() => {
            setCredential(null);
            setPhase({ kind: "enter" });
          }}
          className="text-[12.5px] text-gold hover:text-gold-light transition-colors cursor-pointer"
        >
          Have a code from the bot? Enter it instead →
        </button>
      </>
    );
  }

  if (phase.kind === "error") {
    return (
      <>
        <div className={`flex ${embedded ? "" : "justify-center"} mb-3`}>
          <MaoAvatar state="flagged" size={embedded ? 40 : 56} />
        </div>
        {heading("Something went wrong")}
        <p className={bodyText}>{phase.message}</p>
      </>
    );
  }

  if (phase.kind === "done") {
    return (
      <div className="flex flex-col items-center text-center py-2">
        <span className={`${embedded ? "w-12 h-12 mb-3" : "w-16 h-16 mb-4"} rounded-full bg-safe/15 flex items-center justify-center`}>
          {/* Twin ticks in the glass — Mao clears the connection. */}
          <MaoAvatar
            state="cleared"
            size={embedded ? 40 : 52}
            interactive
            ambient={["nod", "pounce", "glint"]}
          />
        </span>
        {heading(phase.already ? "Already connected" : "Telegram connected")}
        <p className={`${bodyText} ${doneAction ? "mb-5" : "mb-1"}`}>
          {phase.already
            ? "This Telegram is already linked to your account."
            : "Alerts arrive in your chat. Approve or reject reviews from there."}
        </p>
        {doneAction}
      </div>
    );
  }

  /* ── Confirm (link or relink) ── */
  return (
    <>
      {heading("Connect this Telegram?")}

      <div className="flex items-center gap-3 p-3.5 rounded-md bg-foreground/[0.035] border border-foreground/8 mb-4 mt-1">
        <span className="w-[38px] h-[38px] rounded-md shrink-0 flex items-center justify-center bg-gold/12 overflow-hidden">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <ShieldCheck className="h-[17px] w-[17px] text-gold" />
          )}
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

      <p className={`${embedded ? "text-[12px]" : "text-[13px]"} leading-relaxed text-muted-foreground mb-4`}>
        This Telegram will <b className="text-foreground">receive alerts</b> and can{" "}
        <b className="text-foreground">approve or reject</b> flagged transactions. If you
        didn&apos;t request this code, stop here.
      </p>

      {phase.preview.relation === "linked_elsewhere" && (
        <div className="rounded-md border border-watch/30 bg-watch/[0.06] p-3.5 mb-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-watch shrink-0 mt-0.5" />
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              <b className="text-foreground">
                {tgDisplay(phase.preview.telegram)} is connected to another Zhentan account.
              </b>{" "}
              Relinking moves it here and cuts the other account off.
            </p>
          </div>
          <label className="flex items-start gap-2.5 mt-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={relinkConfirmed}
              onChange={(e) => setRelinkConfirmed(e.target.checked)}
              className="mt-0.5 accent-gold"
            />
            <span className="text-[12.5px] leading-relaxed text-foreground">
              I understand — disconnect it from the other account and link it to this one.
            </span>
          </label>
        </div>
      )}

      <Button
        onClick={complete}
        loading={submitting}
        disabled={phase.preview.relation === "linked_elsewhere" && !relinkConfirmed}
        className="w-full"
      >
        {phase.preview.relation === "linked_elsewhere"
          ? "Move connection to this account"
          : phase.preview.relation === "already_linked"
            ? "Confirm"
            : "Connect Telegram"}
      </Button>
    </>
  );
}
