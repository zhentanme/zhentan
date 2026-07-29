"use client";

import { useState, useCallback } from "react";
import type { Address } from "viem";

import { useAuth } from "@/app/context/AuthContext";
import { useApiClient } from "@/lib/api/client";
import {
  activateProtectionCalls,
  enableAgentCalls,
  addBackupCalls,
  detachAgentCalls,
  swapBackupCalls,
  proposeTransition,
} from "@/lib/safe/transitions";
import type { WalletState } from "@/lib/safe/profiles";
import { queueTour } from "@/lib/tours";

export interface SafeTransitionsState {
  /** Current wallet state (starter/guarded/protected/detached/unknown). */
  profile: WalletState | null;
  /** Guarded wallets are nudged to add the backup key. */
  needsUpgrade: boolean;
  /** Backup key chosen/registered (prerequisite for protection transitions). */
  backupKeyLinked: boolean;
  busy: boolean;
  error: string | null;
  /** starter → protected (backup + agent, atomic). */
  activateProtection: () => Promise<void>;
  /** starter → guarded (agent only — screening becomes mandatory). */
  enableAgentOnly: () => Promise<void>;
  /** guarded → protected (add backup key; the legacy upgrade). */
  addBackup: () => Promise<void>;
  /** Replace the backup key with a new one (profile stays protected). */
  swapBackup: (newBackup: string) => Promise<void>;
  /** protected → detached (remove the agent — the exit). */
  detach: () => Promise<void>;
}

/**
 * Wallet-profile transitions. Same address throughout — every transition is
 * an owner-management SafeTx on the deployed Safe, validated hard and
 * auto-executed server-side.
 */
export function useSafeTransitions(): SafeTransitionsState {
  const {
    safeAddress,
    safeConfig,
    externalWalletAddress,
    getOwnerAccount,
    identityToken,
    refreshSafe,
    wallet,
  } = useAuth();
  const api = useApiClient();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agentAddress = process.env.NEXT_PUBLIC_AGENT_ADDRESS;
  const profile = safeConfig?.profile ?? null;
  const needsUpgrade = profile === "guarded";
  const backupKeyLinked = !!externalWalletAddress;

  const run = useCallback(
    async (
      label: string,
      buildCalls: () => ReturnType<typeof activateProtectionCalls>,
      opts?: { registerBackup?: boolean }
    ) => {
      if (!safeAddress || !safeConfig) return;
      setBusy(true);
      setError(null);
      try {
        if (opts?.registerBackup) {
          if (!externalWalletAddress) throw new Error("Add a backup key first");
          // Register so the server can validate the transition calldata
          // against it.
          await api.users.upsert({ safeAddress, externalWalletAddress });
        }
        await proposeTransition({
          calls: buildCalls(),
          label,
          safe: {
            safeAddress,
            owners: safeConfig.owners,
            threshold: safeConfig.threshold,
          },
          getOwnerAccount,
          identityToken,
        });
        // Server persisted the new on-chain owner set — re-pull the record.
        refreshSafe();
      } catch (err) {
        setError(err instanceof Error ? err.message : `${label} failed`);
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [safeAddress, safeConfig, externalWalletAddress, api, getOwnerAccount, identityToken, refreshSafe]
  );

  const activateProtection = useCallback(async () => {
    if (!agentAddress || !externalWalletAddress || !safeAddress) {
      setError("Add a backup key first");
      return;
    }
    await run(
      "Activate protection",
      () =>
        activateProtectionCalls(
          safeAddress as Address,
          externalWalletAddress as Address,
          agentAddress as Address
        ),
      { registerBackup: true }
    );
    // Wallet just became protected — queue the settings walkthrough
    // (TourLauncher waits for the wizard's success dialog to close).
    queueTour("upgrade");
  }, [run, safeAddress, externalWalletAddress, agentAddress]);

  const enableAgentOnly = useCallback(async () => {
    if (!agentAddress || !safeAddress) return;
    await run("Enable Zhentan agent", () =>
      enableAgentCalls(safeAddress as Address, agentAddress as Address)
    );
  }, [run, safeAddress, agentAddress]);

  const addBackup = useCallback(async () => {
    if (!externalWalletAddress || !safeAddress) {
      setError("Add a backup key first");
      return;
    }
    await run(
      "Add backup key",
      () => addBackupCalls(safeAddress as Address, externalWalletAddress as Address),
      { registerBackup: true }
    );
    // Wallet just became protected — queue the settings walkthrough
    // (this is the legacy upgrade path as well as the v2 add-backup).
    queueTour("upgrade");
  }, [run, safeAddress, externalWalletAddress]);

  const swapBackup = useCallback(
    async (newBackup: string) => {
      if (!safeAddress || !safeConfig || !agentAddress) return;
      const agent = agentAddress.toLowerCase();
      const signer = wallet?.address?.toLowerCase() ?? "";
      // The backup slot is the user owner that is neither agent nor signer.
      const oldBackup = safeConfig.owners.find(
        (o) => o.toLowerCase() !== agent && o.toLowerCase() !== signer
      );
      if (!oldBackup) {
        setError("This wallet has no backup key to swap");
        throw new Error("This wallet has no backup key to swap");
      }
      if (oldBackup.toLowerCase() === newBackup.toLowerCase()) {
        setError("That's already your backup key");
        throw new Error("That's already your backup key");
      }
      // Register the NEW key first — the server validates swap calldata
      // against the registered backup. Best-effort restore on failure so the
      // record can't drift from the on-chain owner set.
      await api.users.upsert({ safeAddress, externalWalletAddress: newBackup });
      try {
        await run("Change backup key", () =>
          swapBackupCalls(
            safeAddress as Address,
            safeConfig.owners,
            oldBackup as Address,
            newBackup as Address
          )
        );
      } catch (err) {
        await api.users
          .upsert({ safeAddress, externalWalletAddress: oldBackup })
          .catch(() => {});
        throw err;
      }
    },
    [run, safeAddress, safeConfig, agentAddress, wallet?.address, api]
  );

  const detach = useCallback(async () => {
    if (!agentAddress || !safeAddress || !safeConfig) return;
    await run("Detach Zhentan", () =>
      detachAgentCalls(safeAddress as Address, safeConfig.owners, agentAddress as Address)
    );
  }, [run, safeAddress, safeConfig, agentAddress]);

  return {
    profile,
    needsUpgrade,
    backupKeyLinked,
    busy,
    error,
    activateProtection,
    enableAgentOnly,
    addBackup,
    swapBackup,
    detach,
  };
}
