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
  proposeTransition,
} from "@/lib/safe/transitions";
import type { WalletState } from "@/lib/safe/profiles";

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
  }, [run, safeAddress, externalWalletAddress]);

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
    detach,
  };
}
