"use client";

import { useState, useCallback } from "react";
import { encodeFunctionData } from "viem";

import { useAuth } from "@/app/context/AuthContext";
import { useApiClient } from "@/lib/api/client";
import { proposeDappTransaction } from "@/lib/propose-dapp";
import { SAFE_ABI } from "@/lib/constants";

export interface SafeUpgradeState {
  /** True for legacy 2-of-2 Safes that haven't added the backup key yet. */
  needsUpgrade: boolean;
  /** Backup key already linked via Privy (prerequisite for upgrading). */
  backupKeyLinked: boolean;
  upgrading: boolean;
  error: string | null;
  /** Executes addOwnerWithThreshold(backupKey, 2) via the gasless 4337 pipeline. */
  upgrade: () => Promise<void>;
}

/**
 * Legacy 2-of-2 → 2-of-3 upgrade. The Safe address is unchanged — the linked
 * backup key is added as a third owner on-chain (threshold stays 2), the
 * agent co-signs the one upgrade tx, and the account flips to the
 * Safe-UI-compatible SafeTx flow.
 */
export function useSafeUpgrade(): SafeUpgradeState {
  const {
    safeAddress,
    safeConfig,
    externalWalletAddress,
    getOwnerAccount,
    identityToken,
    refreshSafe,
  } = useAuth();
  const api = useApiClient();

  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsUpgrade = !!safeConfig?.legacy;
  const backupKeyLinked = !!externalWalletAddress;

  const upgrade = useCallback(async () => {
    if (!safeAddress || !safeConfig?.legacy) return;
    if (!externalWalletAddress) {
      setError("Link a backup wallet first");
      return;
    }
    setUpgrading(true);
    setError(null);
    try {
      // Register the backup key so the server can validate the upgrade
      // calldata against it.
      await api.users.upsert({ safeAddress, externalWalletAddress });

      const calldata = encodeFunctionData({
        abi: SAFE_ABI,
        functionName: "addOwnerWithThreshold",
        args: [externalWalletAddress as `0x${string}`, 2n],
      });

      // Route through the legacy gasless pipeline: the Safe may hold no BNB,
      // and if it's still counterfactual the same userOp deploys it via
      // initCode. /queue validates the calldata hard and auto-executes.
      await proposeDappTransaction({
        to: safeAddress,
        value: 0n,
        data: calldata,
        safe: {
          safeAddress,
          owners: safeConfig.owners,
          threshold: safeConfig.threshold,
          executionMode: "4337",
        },
        getOwnerAccount,
        upgrade: true,
        identityToken,
      });

      // Server persisted the new on-chain owner set + safetx mode — re-pull.
      refreshSafe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upgrade failed");
      throw err;
    } finally {
      setUpgrading(false);
    }
  }, [
    safeAddress,
    safeConfig,
    externalWalletAddress,
    api,
    getOwnerAccount,
    identityToken,
    refreshSafe,
  ]);

  return { needsUpgrade, backupKeyLinked, upgrading, error, upgrade };
}
