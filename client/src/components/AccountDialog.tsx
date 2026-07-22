"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, LogOut, Mail } from "lucide-react";
import { clsx } from "clsx";

import { Dialog } from "@/components/ui/Dialog";
import { TwinTick } from "@/components/BrandMark";
import { SignerMismatchInline } from "@/components/SignerMismatchNotice";
import { WalletBrandIcon } from "@/components/WalletBrandIcon";
import { useAuth } from "@/app/context/AuthContext";
import { useApiClient } from "@/lib/api/client";
import { truncateAddress } from "@/lib/format";

/**
 * Compact account dialog — the profile page's hero, condensed: portrait,
 * name/@username, email, vault address (copy + Safe link) and a log-out row.
 * Opened from the sidebar's bottom-left account section.
 */
export function AccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, signerDisplay, safeAddress, logout } = useAuth();
  const api = useApiClient();
  const router = useRouter();

  const [username, setUsername] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!open || !safeAddress) return;
    api.users
      .get(safeAddress)
      .then((data) => setUsername(data?.username ?? null))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, safeAddress]);

  const copyAddress = async () => {
    if (!safeAddress) return;
    await navigator.clipboard.writeText(safeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const displayName =
    user?.name && user.name !== "null" && user.name !== "" ? user.name : "";

  return (
    <Dialog open={open} onClose={onClose} title="Account">
      <div className="space-y-5">
        {/* ── Identity (profile hero, condensed) ── */}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="w-16 h-16 rounded-[18px] border border-gold/25 bg-ink-950 flex items-center justify-center overflow-hidden">
              {user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-semibold text-gold-300 tracking-tight">
                  {(user?.name || user?.email || "Z").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="absolute -right-1 -bottom-1 w-6 h-6 rounded-[10px] bg-ink-900 border border-gold/30 flex items-center justify-center">
              <TwinTick size={12} halo="none" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-foreground tracking-tight truncate">
              {displayName}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <span
                className={clsx(
                  "font-mono text-[12px]",
                  username ? "text-foreground/85" : "text-muted-foreground/50"
                )}
              >
                {username ? `@${username}` : ""}
              </span>
              {username && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-safe/12 text-safe font-mono uppercase tracking-wider text-[9px] font-semibold">
                  <Check className="h-2.5 w-2.5" />
                  Verified
                </span>
              )}
            </div>
            {user?.email ? (
              <div className="flex items-center gap-1.5 mt-1 text-xs text-foreground/80 min-w-0">
                <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
            ) : signerDisplay ? (
              /* Wallet login: no email — show the ACTIVE connected wallet, so
                 a switched account is visible (warning when it can't sign). */
              <div className="flex items-center gap-1.5 mt-1 text-xs text-foreground/80 min-w-0">
                <WalletBrandIcon meta={signerDisplay.meta} className="h-3.5 w-3.5" />
                <span className="truncate">
                  {signerDisplay.meta?.name && (
                    <span className="text-foreground/90">{signerDisplay.meta.name} · </span>
                  )}
                  <span className="font-mono">{truncateAddress(signerDisplay.address, 13)}</span>
                </span>
                <SignerMismatchInline compact />
              </div>
            ) : null}
          </div>
        </div>

        {/* ── Vault address (mirrors the profile page's section) ── */}
        <div className="flex items-center justify-between gap-4 flex-wrap pt-4 border-t border-dashed border-border">
          <div className="min-w-0">
            <span className="eyebrow text-muted-foreground flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/arch-safe.png" alt="" className="h-3 w-3 object-contain shrink-0" />
              Safe address
            </span>
            <p className="font-mono text-xs text-foreground/90 break-all mt-2">
              {safeAddress || "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={copyAddress}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-medium text-muted-foreground hover:border-gold/30 hover:text-gold transition-colors cursor-pointer"
          >
            {copied ? <Check className="h-3 w-3 text-gold" /> : <Copy className="h-3 w-3" />}
            Copy
          </button>
        </div>

        {/* ── Log out ── */}
        <div className="pt-4 border-t border-dashed border-border flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Sign out of Zhentan</p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              Your co-signer goes quiet until you return.
            </p>
          </div>
          <button
            type="button"
            disabled={loggingOut}
            onClick={async () => {
              setLoggingOut(true);
              try {
                await logout();
                router.replace("/login");
              } finally {
                setLoggingOut(false);
              }
            }}
            className="inline-flex items-center gap-2 py-2 px-3.5 rounded-md text-xs font-semibold text-foreground border border-border hover:text-danger hover:border-danger/35 hover:bg-danger/[0.04] transition-colors shrink-0 cursor-pointer disabled:opacity-60"
          >
            <LogOut className="h-3.5 w-3.5" />
            {loggingOut ? "Signing out..." : "Log out"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
