"use client";

import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePrivy, useWallets, useCreateWallet, useIdentityToken } from "@privy-io/react-auth";
import { createWalletClient, custom } from "viem";
import { bsc } from "viem/chains";
import type { Address, LocalAccount } from "viem";
import { useSafeAddress } from "@/lib/useSafeAddress";
import { canonicalOwners, SAFE_2OF3_THRESHOLD } from "@/lib/safe/owners";
import { apiFetch } from "@/lib/api/client";
import { clearOnboardingCompleteCookie } from "@/lib/useOnboarding";

export interface AuthUser {
  email?: string;
  name?: string;
  image?: string;
  telegramUserId?: string;
}

export interface AuthWallet {
  address: string;
}

export interface SafeConfig {
  /** Owner set — canonical [embedded, external, agent] for new Safes, stored set for existing ones. */
  owners: string[];
  threshold: number;
  /** True for pre-2-of-3 Safes (two owners / no backup key) — needs the upgrade flow. */
  legacy: boolean;
  /** True once the Safe contract is deployed on-chain (tracked from eager deploy onward). */
  deployed: boolean;
}

export interface AuthContextType {
  user: AuthUser | null;
  wallet: AuthWallet | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  /** Returns a signer (wallet client + account) for the embedded wallet (for Safe signing). */
  getOwnerAccount: () => Promise<LocalAccount | null>;
  /** Deterministic Safe multisig address for this user + agent */
  safeAddress: string | null;
  /** Whether the Safe address is still being computed */
  safeLoading: boolean;
  /** Linked external wallet address (owner #2 / backup key), if any */
  externalWalletAddress: string | null;
  /** Owner set, threshold, legacy/deployed state and execution mode for this Safe */
  safeConfig: SafeConfig | null;
  /** Re-resolve the Safe record from the backend (after onboarding/upgrade/settings changes) */
  refreshSafe: () => void;
  /** Telegram user ID from linked account */
  telegramUserId?: string;
  /** Raw Privy user for accessing linkedAccounts */
  privyUser: ReturnType<typeof usePrivy>["user"];
  /** Privy identity token — attach as Authorization: Bearer for backend calls */
  identityToken: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user: privyUser, login: privyLogin, logout: privyLogout } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const { identityToken } = useIdentityToken();

  const hasAttemptedCreate = useRef(false);
  const hasSyncedUser = useRef(false);

  const primaryWallet = useMemo(
    () => wallets.find((w) => w.walletClientType === "privy"),
    [wallets]
  );

  useEffect(() => {
    if (!ready || !authenticated || primaryWallet) return;
    if (hasAttemptedCreate.current) return;
    hasAttemptedCreate.current = true;
    createWallet().catch((e) => {
      console.error("Privy createWallet failed:", e);
      hasAttemptedCreate.current = false;
    });
  }, [ready, authenticated, primaryWallet, createWallet]);

  // Switch embedded wallet to app chain (bsc) for signing
  useEffect(() => {
    if (!primaryWallet) return;
    primaryWallet.switchChain(bsc.id).catch((e) => {
      console.warn("Could not switch wallet to bsc:", e);
    });
  }, [primaryWallet]);

  const telegramUserId = useMemo(() => {
    if (!privyUser?.linkedAccounts) return undefined;
    const tg = privyUser.linkedAccounts.find((a) => a.type === "telegram");
    return tg && "telegramUserId" in tg ? String(tg.telegramUserId) : undefined;
  }, [privyUser]);

  const user: AuthUser | null = useMemo(() => {
    if (!privyUser) return null;
    const google = (privyUser as { google?: { email?: string; name?: string; picture?: string } }).google;
    console.log("privyUser", privyUser);
    return {
      email: google?.email,
      name: google?.name,
      image: google?.picture,
      telegramUserId,
    };
  }, [privyUser, telegramUserId]);

  const wallet: AuthWallet | null = useMemo(() => {
    if (!primaryWallet?.address) return null;
    return { address: primaryWallet.address };
  }, [primaryWallet]);

  // Linked external wallet (owner #2 / backup key). Read from linkedAccounts —
  // it persists across sessions even when the wallet isn't currently connected.
  const externalWalletAddress = useMemo(() => {
    const accounts = privyUser?.linkedAccounts ?? [];
    const external = accounts.find(
      (a) =>
        a.type === "wallet" &&
        "walletClientType" in a &&
        a.walletClientType !== "privy" &&
        "address" in a
    );
    return external && "address" in external ? (external.address as string) : null;
  }, [privyUser]);

  const loading = !ready || (authenticated && !primaryWallet);

  const login = useCallback(() => {
    privyLogin();
  }, [privyLogin]);

  const logout = useCallback(async () => {
    clearOnboardingCompleteCookie();
    await privyLogout();
  }, [privyLogout]);

  const [safeRefreshKey, setSafeRefreshKey] = useState(0);
  const refreshSafe = useCallback(() => setSafeRefreshKey((k) => k + 1), []);

  const {
    safeAddress,
    loading: safeLoading,
    record: safeRecord,
    derived: safeDerived,
    derivationVersion,
  } = useSafeAddress({
    embeddedAddress: wallet?.address,
    externalAddress: externalWalletAddress ?? undefined,
    identityToken,
    refreshKey: safeRefreshKey,
  });

  const agentAddress = process.env.NEXT_PUBLIC_AGENT_ADDRESS;

  const safeConfig: SafeConfig | null = useMemo(() => {
    if (!safeAddress) return null;
    if (safeRecord) {
      const owners =
        safeRecord.safe_owners ??
        // Legacy record without stored owners: reconstruct the old 2-of-2 set.
        (safeRecord.signer_address && agentAddress
          ? [safeRecord.signer_address, agentAddress]
          : []);
      const legacy = owners.length < 3;
      return {
        owners,
        threshold: safeRecord.safe_threshold ?? 2,
        legacy,
        deployed: safeRecord.safe_deployed ?? false,
      };
    }
    // Freshly derived 2-of-3 (new user, record not created yet).
    if (!wallet?.address || !externalWalletAddress || !agentAddress) return null;
    return {
      owners: canonicalOwners(
        wallet.address as Address,
        externalWalletAddress as Address,
        agentAddress as Address
      ),
      threshold: SAFE_2OF3_THRESHOLD,
      legacy: false,
      deployed: false,
    };
  }, [safeAddress, safeRecord, wallet?.address, externalWalletAddress, agentAddress]);

  useEffect(() => {
    if (!safeAddress || !identityToken || hasSyncedUser.current) return;
    hasSyncedUser.current = true;
    const google = (privyUser as { google?: { email?: string; name?: string } } | null)?.google;
    apiFetch("/users", identityToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        safeAddress,
        email: google?.email,
        name: google?.name,
        telegramId: telegramUserId,
        signerAddress: wallet?.address,
        // Persist the owner model only for freshly derived Safes — legacy
        // records get their owner set from the upgrade flow, not this sync.
        ...(safeDerived &&
          safeConfig && {
            externalWalletAddress: externalWalletAddress ?? undefined,
            safeOwners: safeConfig.owners,
            safeThreshold: safeConfig.threshold,
            derivationVersion: derivationVersion ?? undefined,
          }),
      }),
    }).catch((e) => console.error("Failed to sync user details:", e));
  }, [
    safeAddress,
    identityToken,
    privyUser,
    telegramUserId,
    wallet?.address,
    safeDerived,
    safeConfig,
    externalWalletAddress,
    derivationVersion,
  ]);

  const getOwnerAccount = useCallback(async (): Promise<LocalAccount | null> => {
    if (!primaryWallet) return null;
    try {
      const provider = await primaryWallet.getEthereumProvider();
      const walletAddress = primaryWallet.address as Address;
      const walletClient = createWalletClient({
        account: walletAddress,
        chain: bsc,
        transport: custom(provider),
      });
      const signer = { ...walletClient, address: walletAddress };
      return signer as unknown as LocalAccount;
    } catch (e) {
      console.error("getOwnerAccount failed:", e);
      return null;
    }
  }, [primaryWallet]);

  const value: AuthContextType = useMemo(
    () => ({
      user,
      wallet,
      loading,
      login,
      logout,
      getOwnerAccount,
      safeAddress,
      safeLoading,
      externalWalletAddress,
      safeConfig,
      refreshSafe,
      telegramUserId,
      privyUser: privyUser ?? null,
      identityToken: identityToken ?? null,
    }),
    [user, wallet, loading, login, logout, getOwnerAccount, safeAddress, safeLoading, externalWalletAddress, safeConfig, refreshSafe, telegramUserId, privyUser, identityToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider (inside PrivyProvider)");
  }
  return ctx;
}
