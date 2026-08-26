"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { clsx } from "clsx";

import { useAuth } from "@/app/context/AuthContext";
import { truncateAddress } from "@/lib/format";

/**
 * Non-blocking surfaces for a wallet-login session whose linked signer is not
 * the extension's active account. The app keeps rendering the pinned
 * identity's data; these just warn that signing is unavailable and offer the
 * wallet's account picker to hop back. Both render nothing when there is no
 * mismatch, so call sites can mount them unconditionally.
 */

/** Shared switch action: try the account picker, fall back to manual copy. */
function useSignerSwitch() {
  const { signerMismatch, requestSignerSwitch } = useAuth();
  const [manualHint, setManualHint] = useState(false);
  const [busy, setBusy] = useState(false);

  const trySwitch = async () => {
    setBusy(true);
    try {
      const prompted = await requestSignerSwitch();
      if (!prompted) setManualHint(true);
    } finally {
      setBusy(false);
    }
  };

  return { signerMismatch, manualHint, busy, trySwitch };
}

/** Page-wide strip (mounted once in AppFrame) — "connected with a non-signer". */
export function SignerMismatchBanner() {
  const { signerMismatch, manualHint, busy, trySwitch } = useSignerSwitch();
  if (!signerMismatch) return null;

  const { expected, active, walletName } = signerMismatch;
  const walletLabel = walletName ?? "your wallet";

  return (
    <div className="border-b border-danger/25 bg-danger/[0.06]">
      <div className="px-4 sm:px-6 py-2.5 flex items-center gap-3 flex-wrap">
        <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
        <p className="text-xs text-foreground/90 min-w-0 flex-1 leading-relaxed">
          {active ? (
            <>
              You&apos;re connected with a non-signer account{" "}
              <span className="font-mono text-danger">{truncateAddress(active)}</span>.
              Signing needs{" "}
              <span className="font-mono">{truncateAddress(expected)}</span>.
            </>
          ) : (
            <>{walletLabel} is locked or disconnected — signing is unavailable until it reconnects.</>
          )}
          {manualHint && (
            <span className="text-muted-foreground"> Open {walletLabel} and switch manually.</span>
          )}
        </p>
        {active && (
          <Button variant="danger" size="sm" loading={busy} onClick={trySwitch} className="shrink-0">
            {!busy && <ArrowRightLeft className="h-3 w-3" />}
            {busy ? "Check your wallet…" : "Switch account"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Red warning + switch button beside the signer row (profile / account dialog). */
export function SignerMismatchInline({ compact = false }: { compact?: boolean }) {
  const { signerMismatch, manualHint, busy, trySwitch } = useSignerSwitch();
  if (!signerMismatch) return null;

  const { expected, active, walletName } = signerMismatch;
  const walletLabel = walletName ?? "your wallet";
  const title = active
    ? `This account can't sign for your Safe — switch back to ${truncateAddress(expected)}`
    : `${walletLabel} is locked or disconnected`;

  return (
    <span className={clsx("inline-flex items-center shrink-0", compact ? "gap-1.5" : "gap-2")}>
      <span title={title} className="inline-flex">
        <AlertTriangle className={clsx("text-danger", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
      </span>
      {active && (
        <button
          type="button"
          onClick={trySwitch}
          disabled={busy}
          className={clsx(
            "inline-flex items-center rounded-md border border-danger/40 font-semibold text-danger hover:bg-danger/10 transition-colors cursor-pointer disabled:opacity-50",
            compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
          )}
        >
          {busy ? "Check your wallet…" : manualHint ? `Switch in ${walletLabel}` : "Switch"}
        </button>
      )}
    </span>
  );
}
