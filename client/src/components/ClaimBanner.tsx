"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, AtSign, MessageCircle, Gift, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { useApiClient } from "@/lib/api/client";
import { useScreeningStatus } from "@/app/context/ScreeningStatusContext";
import type { CampaignStatus } from "@/lib/api/campaigns";
import { ClaimAnimation, type ClaimAnimationPhase } from "@/components/ClaimAnimation";

const CAMPAIGN_ID = "flap-india-meetup";

function formatTimeRemaining(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const diffMs = new Date(endsAt).getTime() - Date.now();
  if (diffMs <= 0) return "Ended";
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "Ends in <1 hour";
  if (hours < 24) return `Ends in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(diffMs / 86_400_000);
  return `Ends in ${days} day${days === 1 ? "" : "s"}`;
}

const TASK_LABELS: Record<
  string,
  { label: string; subtext: string; icon: React.ElementType; route: string }
> = {
  tg_connected: {
    label: "Connect Telegram",
    subtext: "Enable Zhentan mode and connect your Telegram.",
    icon: MessageCircle,
    route: "/settings",
  },
  username_claimed: {
    label: "Set a username",
    subtext: "Set a Zhentan username on profile.",
    icon: AtSign,
    route: "/profile",
  },
};

interface ClaimBannerProps {
  safeAddress: string;
  username: string | null | undefined;
  /** If true, the banner animates out and disappears once claimed */
  hideWhenClaimed?: boolean;
  /** Called after the claim animation fully completes */
  onClaimed?: () => void;
  /** Extra classes applied to the banner button (e.g. to override margin) */
  className?: string;
}

export function ClaimBanner({
  safeAddress,
  username,
  hideWhenClaimed = false,
  onClaimed,
  className,
}: ClaimBannerProps) {
  const api = useApiClient();
  const { telegramLinked } = useScreeningStatus();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<CampaignStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [animPhase, setAnimPhase] = useState<ClaimAnimationPhase>("idle");
  const [animTokenAmount, setAnimTokenAmount] = useState(0);

  const taskMet: Record<string, boolean> = {
    tg_connected:     telegramLinked,
    username_claimed: !!username,
  };

  const fetchStatus = useCallback(async () => {
    if (!safeAddress) return;
    setLoading(true);
    try {
      const s = await api.campaigns.get(CAMPAIGN_ID, safeAddress);
      setStatus(s);
    } catch {
      // campaign may not exist yet
    } finally {
      setLoading(false);
      setStatusLoaded(true);
    }
  }, [safeAddress, api]);

  const handleAnimPhaseChange = useCallback((phase: ClaimAnimationPhase) => {
    setAnimPhase(phase);
    if (phase === "idle") {
      fetchStatus();
      onClaimed?.();
      if (hideWhenClaimed) setTimeout(() => setDismissed(true), 400);
    }
  }, [fetchStatus, hideWhenClaimed, onClaimed]);

  // Fetch on mount (for hideWhenClaimed mode) or lazily on dialog open
  useEffect(() => {
    if (safeAddress) {
      fetchStatus();
    }
  }, [hideWhenClaimed, safeAddress, fetchStatus]);

  useEffect(() => {
    if (open && !status) fetchStatus();
  }, [open, status, fetchStatus]);

  const handleClaim = async () => {
    setClaiming(true);
    setClaimError(null);
    try {
      const claim = await api.campaigns.claim(CAMPAIGN_ID, safeAddress);
      setOpen(false);
      setAnimTokenAmount(Math.floor(Number(claim.token_amount)));
      setAnimPhase("counting");
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setClaiming(false);
    }
  };

  const allTasksMet = status
    ? Object.entries(status.campaign.requirements)
        .filter(([, v]) => v)
        .every(([k]) => taskMet[k])
    : false;

  const alreadyClaimed = !!status?.userClaim;
  const noSpotsLeft = status ? status.claimsRemaining <= 0 : false;

  // A campaign is "active" only inside its start/end window. Outside it — or
  // when no campaign exists / the status fetch failed (status stays null) —
  // the banner must not render at all.
  const now = Date.now();
  const campaignActive =
    !!status &&
    new Date(status.campaign.starts_at).getTime() <= now &&
    (status.campaign.ends_at === null ||
      new Date(status.campaign.ends_at).getTime() > now);

  // Wait for the campaign state before deciding (avoids a banner flashing in
  // then vanishing), then never render without an active campaign.
  if (!statusLoaded) return null;
  if (!campaignActive) return null;

  // Hide the entire banner once claimed, when configured.
  if (hideWhenClaimed && (alreadyClaimed || dismissed)) return null;

  return (
    <>
      <AnimatePresence>
        {!dismissed && (
          <motion.button
            key="claim-banner-trigger"
            type="button"
            onClick={() => setOpen(true)}
            initial={hideWhenClaimed ? { opacity: 0, y: -8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.3, type: "spring", bounce: 0.15 }}
            className={`w-full relative overflow-hidden rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 group cursor-pointer ${className ?? "mx-4 lg:mx-0"}${hideWhenClaimed ? " mb-4" : ""}`}
            style={{
              background:
                "linear-gradient(135deg, rgba(196,148,40,0.12) 0%, rgba(196,148,40,0.05) 50%, rgba(196,148,40,0.10) 100%)",
              boxShadow:
                "0 0 0 1px rgba(196,148,40,0.25), 0 8px 32px -8px rgba(196,148,40,0.20)",
            }}
          >
            {/* Shimmer line */}
            <div
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(196,148,40,0.6) 50%, transparent 100%)",
              }}
            />
            {/* Glow orb */}
            <div
              className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none"
              style={{
                background: "radial-gradient(circle, rgba(196,148,40,0.15) 0%, transparent 70%)",
              }}
            />

            <div className="relative px-5 py-4 flex items-center gap-4">
              <div
                className="w-11 h-11 rounded-md flex items-center justify-center shrink-0"
                style={{
                  background: "rgba(196,148,40,0.15)",
                  boxShadow: "0 0 16px rgba(196,148,40,0.2)",
                }}
              >
                <Image
                  src="/flap-logo.png"
                  alt="Flap"
                  width={32}
                  height={32}
                  className="h-8 w-8 object-contain"
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-foreground">Celebrating Flap India Meetup</p>
                  <Gift className="h-3 w-3 text-gold/70" />
                </div>
                <p className="text-xs text-gold/60 mt-0.5">
                  {alreadyClaimed
                    ? "Claimed"
                    : status
                    ? formatTimeRemaining(status.campaign.ends_at) ?? "Complete tasks to claim"
                    : "Complete tasks to claim"}
                </p>
              </div>

              {alreadyClaimed ? (
                <span className="text-[11px] font-semibold text-gold bg-gold/15 px-2.5 py-1 rounded-full border border-gold/20 shrink-0">
                  Claimed
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-primary-foreground bg-gold px-3 py-1.5 rounded-full shrink-0 shadow-[0_0_12px_rgba(196,148,40,0.4)] group-hover:bg-gold/90 transition-colors">
                  Claim
                </span>
              )}
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      <ClaimAnimation
        phase={animPhase}
        tokenAmount={animTokenAmount}
        tokenSymbol="Tokens"
        onPhaseChange={handleAnimPhaseChange}
      />

      <Dialog open={open} onClose={() => setOpen(false)} title="Claim rewards">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 text-muted-foreground/80 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {status && (
              <p className="text-xs text-muted-foreground/80 text-center">
                {alreadyClaimed
                  ? "You've already claimed"
                  : formatTimeRemaining(status.campaign.ends_at) ?? "Complete tasks to claim"}
              </p>
            )}

            {/* Tasks */}
            <div className="space-y-2">
              <p className="eyebrow text-muted-foreground/80 px-1">
                Tasks
              </p>
              {status &&
                Object.entries(status.campaign.requirements)
                  .filter(([, required]) => required)
                  .map(([key]) => {
                    const met = taskMet[key] ?? false;
                    const def = TASK_LABELS[key];
                    const Icon = def?.icon ?? Check;
                    const handleTaskClick = !met && def?.route
                      ? () => { setOpen(false); router.push(def.route); }
                      : undefined;
                    return met ? (
                      <div
                        key={key}
                        className="flex items-center gap-3 p-3 rounded-md bg-foreground/4 border border-border"
                      >
                        <div className="w-8 h-8 rounded-sm flex items-center justify-center shrink-0 bg-gold/10 shadow-[0_0_8px_rgba(196,148,40,0.15)]">
                          <Icon className="h-4 w-4 text-gold" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground">{def?.label ?? key}</p>
                          {def?.subtext && (
                            <p className="text-xs text-muted-foreground/80 mt-0.5">
                              {def.subtext}
                            </p>
                          )}
                        </div>
                        <Check className="h-4 w-4 text-gold shrink-0" />
                      </div>
                    ) : (
                      <button
                        key={key}
                        type="button"
                        onClick={handleTaskClick}
                        className="w-full flex items-center gap-3 p-3 rounded-md bg-foreground/4 border border-border hover:bg-foreground/6 hover:border-foreground/15 transition-colors text-left cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-sm flex items-center justify-center shrink-0 bg-foreground/4">
                          <Icon className="h-4 w-4 text-muted-foreground/60" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground/80">{def?.label ?? key}</p>
                          {def?.subtext && (
                            <p className="text-xs text-muted-foreground/80 mt-0.5">
                              {def.subtext}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                      </button>
                    );
                  })}
            </div>

            {/* Claimed state */}
            {alreadyClaimed && (
              <div className="p-3 rounded-md bg-gold/5 shadow-[0_0_0_1px_rgba(196,148,40,0.1)] text-center">
                <p className="text-sm font-medium text-gold">
                  {status!.userClaim!.token_amount
                    ? `${status!.userClaim!.token_amount} $ZHENTAN tokens claimed`
                    : "Tokens claimed"}
                </p>
                <p className="text-xs text-muted-foreground/80 mt-0.5">
                  {status!.userClaim!.status === "paid" ? "" : "Payout pending"}
                </p>
              </div>
            )}

            {/* Claim button */}
            {!alreadyClaimed && (
              <>
                {claimError && (
                  <p className="text-xs text-danger px-1">{claimError}</p>
                )}
                <button
                  type="button"
                  onClick={handleClaim}
                  disabled={claiming || !allTasksMet || noSpotsLeft}
                  className="w-full py-3 rounded-md text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer bg-gold text-primary-foreground hover:bg-gold/90 shadow-[0_0_20px_rgba(196,148,40,0.25)]"
                >
                  {claiming ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Claiming…
                    </span>
                  ) : noSpotsLeft ? (
                    "No spots remaining"
                  ) : !allTasksMet ? (
                    "Complete tasks to claim"
                  ) : (
                    "Claim tokens"
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
