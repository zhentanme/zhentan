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
import { notePendingTransition } from "@/lib/pendingTransition";

/**
 * `pending: true` means the transition was ACCEPTED but executes
 * asynchronously (screened path, #136.3) — the wallet is not upgraded yet;
 * callers must show a pending state and wait for the profile to flip.
 */
export interface TransitionResult {
  pending: boolean;
}

export interface SafeTransitionsState {
  /** Current wallet state (starter/guarded/protected/detached/unknown). */
  profile: WalletState | null;
  busy: boolean;
  error: string | null;
  /** starter → protected (backup + agent, atomic). */
  activateProtection: () => Promise<TransitionResult>;
  /** starter → guarded (agent only — screening becomes mandatory). */
  enableAgentOnly: () => Promise<TransitionResult>;
  /** guarded → protected (add backup key; the legacy upgrade). */
  addBackup: () => Promise<TransitionResult>;
  /** Replace the backup key with a new one (profile stays protected). */
  swapBackup: (newBackup: string) => Promise<TransitionResult>;
  /** protected → detached (remove the agent — the exit). */
  detach: () => Promise<TransitionResult>;
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

  const run = useCallback(
    async (
      label: string,
      buildCalls: () => ReturnType<typeof activateProtectionCalls>,
      opts?: { registerBackup?: boolean }
    ): Promise<TransitionResult> => {
      if (!safeAddress || !safeConfig) return { pending: false };
      setBusy(true);
      setError(null);
      try {
        if (opts?.registerBackup) {
          if (!externalWalletAddress) throw new Error("Add a backup key first");
          // Register so the server can validate the transition calldata
          // against it.
          await api.users.upsert({ safeAddress, externalWalletAddress });
        }
        const result = await proposeTransition({
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
        return { pending: result.pending };
      } catch (err) {
        setError(err instanceof Error ? err.message : `${label} failed`);
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [safeAddress, safeConfig, externalWalletAddress, api, getOwnerAccount, identityToken, refreshSafe]
  );

  const activateProtection = useCallback(async (): Promise<TransitionResult> => {
    if (!agentAddress || !externalWalletAddress || !safeAddress) {
      setError("Add a backup key first");
      return { pending: false };
    }
    const result = await run(
      "Activate protection",
      () =>
        activateProtectionCalls(
          safeAddress as Address,
          externalWalletAddress as Address,
          agentAddress as Address
        ),
      { registerBackup: true }
    );
    if (result.pending) notePendingTransition("protected");
    // Wallet just became protected — queue the settings walkthrough
    // (TourLauncher waits for the wizard's success dialog to close).
    queueTour("upgrade");
    return result;
  }, [run, safeAddress, externalWalletAddress, agentAddress]);

  const enableAgentOnly = useCallback(async (): Promise<TransitionResult> => {
    if (!agentAddress || !safeAddress) return { pending: false };
    const result = await run("Enable Zhentan agent", () =>
      enableAgentCalls(safeAddress as Address, agentAddress as Address)
    );
    if (result.pending) notePendingTransition("guarded");
    return result;
  }, [run, safeAddress, agentAddress]);

  const addBackup = useCallback(async (): Promise<TransitionResult> => {
    if (!externalWalletAddress || !safeAddress) {
      setError("Add a backup key first");
      return { pending: false };
    }
    const result = await run(
      "Add backup key",
      () => addBackupCalls(safeAddress as Address, externalWalletAddress as Address),
      { registerBackup: true }
    );
    if (result.pending) notePendingTransition("protected");
    // Wallet just became protected — queue the settings walkthrough
    // (this is the legacy upgrade path as well as the v2 add-backup).
    queueTour("upgrade");
    return result;
  }, [run, safeAddress, externalWalletAddress]);

  const swapBackup = useCallback(
    async (newBackup: string): Promise<TransitionResult> => {
      if (!safeAddress || !safeConfig || !agentAddress) return { pending: false };
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
        const result = await run("Change backup key", () =>
          swapBackupCalls(
            safeAddress as Address,
            safeConfig.owners,
            oldBackup as Address,
            newBackup as Address
          )
        );
        if (result.pending) notePendingTransition("protected");
        return result;
      } catch (err) {
        await api.users
          .upsert({ safeAddress, externalWalletAddress: oldBackup })
          .catch(() => {});
        throw err;
      }
    },
    [run, safeAddress, safeConfig, agentAddress, wallet?.address, api]
  );

  const detach = useCallback(async (): Promise<TransitionResult> => {
    if (!agentAddress || !safeAddress || !safeConfig) return { pending: false };
    const result = await run("Detach Zhentan", () =>
      detachAgentCalls(safeAddress as Address, safeConfig.owners, agentAddress as Address)
    );
    if (result.pending) notePendingTransition("detached");
    return result;
  }, [run, safeAddress, safeConfig, agentAddress]);

  return {
    profile,
    busy,
    error,
    activateProtection,
    enableAgentOnly,
    addBackup,
    swapBackup,
    detach,
  };
}
