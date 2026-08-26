"use client";

import Image from "next/image";

import { useCoSignTransaction, type CoSignableTx } from "@/hooks/useCoSignTransaction";
import { WalletBrandIcon } from "@/components/WalletBrandIcon";
import { Button } from "@/components/ui/Button";
import { InlineError } from "@/components/ui/InlineError";
import { truncateAddress } from "@/lib/format";

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
        <Button
          loading={busy}
          onClick={async () => {
            const result = await coSign(tx);
            if (result) onExecuted?.(result);
          }}
          className="w-full"
        >
          Sign with
          <WalletBrandIcon meta={backup.meta} className="h-4 w-4" />
          <span className="font-mono text-[13px]">{truncateAddress(backup.address)}</span>
        </Button>
      ) : backup.kind === "wrong" ? (
        <Button variant="outline" disabled={busy} onClick={connectBackup} className="w-full">
          Change wallet
          <span className="inline-flex items-center gap-1.5 text-gold/70">
            <WalletBrandIcon meta={backup.meta} className="h-4 w-4" />
            <span className="font-mono text-[13px]">{truncateAddress(backup.address)}</span>
          </span>
        </Button>
      ) : (
        <Button variant="outline" disabled={busy} onClick={connectBackup} className="w-full">
          Connect wallet
          <span className="inline-flex items-center gap-1">
            <Image src="/metamask.webp" alt="MetaMask" width={16} height={16} className="rounded-xs" />
            <Image src="/rabby.png" alt="Rabby" width={16} height={16} className="rounded-xs" />
          </span>
        </Button>
      )}
      {hint && <p className="text-xs text-muted-foreground text-center">{hint}</p>}
      {error && <InlineError className="justify-center">{error}</InlineError>}
    </div>
  );
}
