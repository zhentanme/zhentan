"use client";

import { useCallback, useMemo, useState } from "react";
import { useConnectWallet, useWallets } from "@privy-io/react-auth";
import type { Address } from "viem";

import { useAuth, type SignerWalletMeta } from "@/app/context/AuthContext";
import { useApiClient } from "@/lib/api/client";
import { signSafeTx } from "@/lib/safe/safeTx";
import { truncateAddress } from "@/lib/format";
import type { SafeTxData } from "@/types";

export interface CoSignableTx {
  id: string;
  safeAddress: string;
  safeTx?: SafeTxData;
}

/**
 * Live connection state of the BACKUP key, for rendering the co-sign action:
 * - ready: the backup wallet has an active session — it can sign right now.
 * - wrong: some external wallet is connected, but it isn't the backup (for
 *   wallet-login users this includes their own signer session).
 * - none: no external wallet connected at all.
 */
export type BackupConnection =
  | { kind: "ready"; address: string; meta: SignerWalletMeta }
  | { kind: "wrong"; address: string; meta: SignerWalletMeta }
  | { kind: "none" };

/**
 * Backup-key completion for a screening-off SafeTx queued below threshold:
 * sign the SafeTx with the backup key's session and submit it — the server
 * verifies the co-signature and the relayer executes relay-only (the agent
 * never signs what it didn't screen).
 *
 * `backup` reflects the live wallet connection so the UI can offer the right
 * action (sign / connect / change wallet); `connectBackup` opens Privy's
 * signature-free connect modal. `coSign` returns the execution result on
 * success, null otherwise (failures land in `error`).
 */
export function useCoSignTransaction() {
  const { getBackupAccount, externalWalletAddress } = useAuth();
  const { wallets } = useWallets();
  const { connectWallet } = useConnectWallet();
  const api = useApiClient();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const backup: BackupConnection = useMemo(() => {
    const externals = wallets.filter((w) => w.walletClientType !== "privy");
    const metaOf = (w: (typeof externals)[number]): SignerWalletMeta => ({
      name: w.meta?.name ?? w.walletClientType,
      icon: w.meta?.icon,
      clientType: w.walletClientType,
    });
    if (externalWalletAddress) {
      const match = externals.find(
        (w) => w.address.toLowerCase() === externalWalletAddress.toLowerCase()
      );
      if (match) return { kind: "ready", address: match.address, meta: metaOf(match) };
    }
    const other = externals[0];
    if (other) return { kind: "wrong", address: other.address, meta: metaOf(other) };
    return { kind: "none" };
  }, [wallets, externalWalletAddress]);

  const connectBackup = useCallback(() => {
    setHint(null);
    setError(null);
    connectWallet();
  }, [connectWallet]);

  const coSign = useCallback(
    async (tx: CoSignableTx): Promise<{ txHash?: string } | null> => {
      setBusy(true);
      setHint(null);
      setError(null);
      try {
        const account = await getBackupAccount();
        if (!account) {
          // Session evaporated between render and click — reconnect first.
          setHint(
            `Connect your backup wallet${
              externalWalletAddress
                ? ` (${truncateAddress(externalWalletAddress, 13)})`
                : ""
            }, then tap again.`
          );
          connectWallet();
          return null;
        }
        if (!tx.safeTx) throw new Error("Transaction payload unavailable");
        const signature = await signSafeTx(account, tx.safeAddress as Address, tx.safeTx);

        let execution: { status?: string; txHash?: string; error?: string };
        try {
          ({ execution } = await api.transactions.cosign(tx.id, signature));
        } catch (e) {
          // The signature may already be stored from an earlier attempt whose
          // execution failed (e.g. a service blip) — retry execution directly.
          if (e instanceof Error && /already signed/i.test(e.message)) {
            const run = await api.execute.run(tx.id);
            execution = { txHash: run.txHash };
          } else {
            throw e;
          }
        }
        if (execution?.error) throw new Error(String(execution.error));
        return { txHash: execution?.txHash };
      } catch (e) {
        setError(e instanceof Error ? e.message : "Co-sign failed");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [getBackupAccount, externalWalletAddress, connectWallet, api]
  );

  return { coSign, connectBackup, backup, busy, hint, error };
}
