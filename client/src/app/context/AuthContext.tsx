"use client";

import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePrivy, useWallets, useCreateWallet, useIdentityToken } from "@privy-io/react-auth";
import { createWalletClient, custom } from "viem";
import { bsc } from "viem/chains";
import type { Address, LocalAccount } from "viem";
import { useSafeAddress } from "@/lib/useSafeAddress";
import { apiFetch } from "@/lib/api/client";

export interface AuthUser {
  email?: string;
  name?: string;
  image?: string;
  telegramUserId?: string;
}

export interface AuthWallet {
  address: string;
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

  const loading = !ready || (authenticated && !primaryWallet);

  const login = useCallback(() => {
    privyLogin();
  }, [privyLogin]);

  const logout = useCallback(async () => {
    await privyLogout();
  }, [privyLogout]);

  const { safeAddress, loading: safeLoading } = useSafeAddress(wallet?.address ?? undefined);

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
      }),
    }).catch((e) => console.error("Failed to sync user details:", e));
  }, [safeAddress, identityToken, privyUser, telegramUserId, wallet?.address]);

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
      telegramUserId,
      privyUser: privyUser ?? null,
      identityToken: identityToken ?? null,
    }),
    [user, wallet, loading, login, logout, getOwnerAccount, safeAddress, safeLoading, telegramUserId, privyUser, identityToken]
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
