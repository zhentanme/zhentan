"use client";

import Image from "next/image";

import { useCoSignTransaction, type CoSignableTx } from "@/hooks/useCoSignTransaction";
import { WalletBrandIcon } from "@/components/WalletBrandIcon";
import { truncateAddress } from "@/lib/format";

const BUTTON_CLASS =
  "flex items-center justify-center gap-2 w-full rounded-2xl py-3 bg-gold/15 border border-gold/40 text-gold hover:bg-gold/20 transition-colors text-sm font-semibold cursor-pointer disabled:opacity-60";

/**
 * The backup-key completion action for a queued screening-off SafeTx, shaped
 * by the LIVE wallet connection:
 * - backup connected → "Sign with <icon> <address>" — signs and executes.
 * - wrong wallet connected → "Change wallet" with the connected wallet's
 *   icon + address — opens the connect modal to switch.
 * - nothing connected → "Connect wallet" with the supported-wallet brand
 *   icons — opens the connect modal.
 */
export function CoSignButton({
  tx,
  onExecuted,
}: {
  tx: CoSignableTx;
  /** Called after a successful sign + relay-execute (omit to rely on polling). */
  onExecuted?: (result: { txHash?: string }) => void;
}) {
  const { coSign, connectBackup, backup, busy, hint, error } = useCoSignTransaction();

  return (
    <div className="space-y-2">
      {backup.kind === "ready" ? (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            const result = await coSign(tx);
            if (result) onExecuted?.(result);
          }}
          className={BUTTON_CLASS}
        >
          {busy ? (
            "Signing..."
          ) : (
            <>
              Sign with
              <WalletBrandIcon meta={backup.meta} className="h-4 w-4" />
              <span className="font-mono text-[13px]">{truncateAddress(backup.address, 13)}</span>
            </>
          )}
        </button>
      ) : backup.kind === "wrong" ? (
        <button type="button" onClick={connectBackup} className={BUTTON_CLASS}>
          Change wallet
          <span className="inline-flex items-center gap-1.5 text-gold/70">
            <WalletBrandIcon meta={backup.meta} className="h-4 w-4" />
            <span className="font-mono text-[13px]">{truncateAddress(backup.address, 13)}</span>
          </span>
        </button>
      ) : (
        <button type="button" onClick={connectBackup} className={BUTTON_CLASS}>
          Connect wallet
          <span className="inline-flex items-center gap-1">
            <Image src="/metamask.webp" alt="MetaMask" width={16} height={16} className="rounded-[3px]" />
            <Image src="/rabby.png" alt="Rabby" width={16} height={16} className="rounded-[3px]" />
          </span>
        </button>
      )}
      {hint && <p className="text-xs text-muted-foreground text-center">{hint}</p>}
      {error && <p className="text-xs text-danger text-center break-all">{error}</p>}
    </div>
  );
}
