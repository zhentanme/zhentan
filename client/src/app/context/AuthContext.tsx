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
import { classifyProfile, type WalletProfile, type WalletState } from "@/lib/safe/profiles";
import { apiFetch } from "@/lib/api/client";
import { clearIdentityCache } from "@/lib/identityCache";
import { clearOnboardingCompleteCookie, clearOnboardingStorage } from "@/lib/useOnboarding";

export interface AuthUser {
  email?: string;
  name?: string;
  image?: string;
  telegramUserId?: string;
}

export interface AuthWallet {
  address: string;
}

/** Brand of the connected signing wallet (wallet login) — from Privy's EIP-6963 metadata. */
export interface SignerWalletMeta {
  /** Wallet product name, e.g. "MetaMask", "Rabby Wallet". */
  name: string;
  /** Wallet logo (usually a data URI) reported by the wallet itself. */
  icon?: string;
  /** Privy wallet client type, e.g. "metamask", "rabby_wallet". */
  clientType: string;
}

/**
 * Wallet-login sessions are pinned to the SIWE-linked signer, but the
 * extension exposes ONE active account: switching accounts (or locking /
 * disconnecting the wallet) makes the signer unavailable while the session
 * stays authenticated. This state names that condition so the UI can explain
 * it instead of hanging on a loader.
 */
export interface SignerMismatch {
  /** The linked signer address the session is pinned to. */
  expected: string;
  /** The wallet's currently active account — null when locked/disconnected. */
  active: string | null;
  /** Wallet product name, e.g. "MetaMask" — best-effort. */
  walletName: string | null;
}

/** Wallet rendered in signer rows (profile / account dialog). */
export interface SignerDisplay {
  address: string;
  meta: SignerWalletMeta | null;
}

export interface SafeConfig {
  /** Owner set — creation recipe for new Safes, stored (chain-mirrored) set for existing ones. */
  owners: string[];
  threshold: number;
  /** Wallet state, computed from owners/threshold/agent membership — never stored. */
  profile: WalletState;
  /** Back-compat alias: guarded wallets (agent, no backup key) need the add-backup transition. */
  legacy: boolean;
  /** True once the Safe contract is deployed on-chain (tracked from eager deploy onward). */
  deployed: boolean;
  /**
   * Derivation recipe version (1 = legacy 4337 2-of-2, 2 = vanilla stock Safe).
   * `null` for pre-column legacy records — treated as v1. Drives the legacy
   * screening-off exception: v1 agents may co-sign transactions they didn't
   * screen, since those wallets have no backup key to reach the threshold.
   */
  derivationVersion: number | null;
}

export interface AuthContextType {
  user: AuthUser | null;
  wallet: AuthWallet | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  /** Returns a signer (wallet client + account) for the embedded wallet (for Safe signing). */
  getOwnerAccount: () => Promise<LocalAccount | null>;
  /** Signer for the backup key — null unless that wallet has an active connection session. */
  getBackupAccount: () => Promise<LocalAccount | null>;
  /** Deterministic Safe multisig address for this user + agent */
  safeAddress: string | null;
  /** Whether the Safe address is still being computed */
  safeLoading: boolean;
  /**
   * Brand of the connected signing wallet (name/icon) for wallet-login users.
   * Null for embedded signers (Google) and until the wallet (re)connects.
   */
  signerWalletMeta: SignerWalletMeta | null;
  /**
   * Wallet login only: the extension's active account can't sign for this
   * Safe — it's neither the linked signer nor any other owner (switching to
   * the backup key is legitimate co-signing, not a mistake). Non-blocking —
   * the app keeps rendering the pinned identity's data; clears reactively.
   */
  signerMismatch: SignerMismatch | null;
  /**
   * Wallet to render in signer rows: the extension's currently ACTIVE wallet
   * when one is connected — a switched account shows as itself, which helps
   * the user notice and switch back — otherwise the pinned signer identity.
   */
  signerDisplay: SignerDisplay | null;
  /**
   * Prompt the active wallet's account picker (wallet_requestPermissions) so
   * the user can switch back to the signer. Resolves false when no wallet is
   * reachable or the request is unsupported — show "switch manually" copy.
   */
  requestSignerSwitch: () => Promise<boolean>;
  /** Backup key address (owner #2) — from the record, this session's choice, or a legacy Privy link */
  externalWalletAddress: string | null;
  /** Set the backup key for this session (pasted / ENS-resolved / connected — no signature) */
  setBackupAddress: (addr: string | null) => void;
  /** True once the backup key is persisted on the record (changing it = on-chain owner swap) */
  backupAddressLocked: boolean;
  /** Confirms the backup-key choice — allows the user record (safe_address PK + owner set) to persist */
  commitSafe: () => void;
  /** Creation profile chosen during onboarding (drives new-user derivation) */
  pendingProfile: WalletProfile | null;
  setPendingProfile: (p: WalletProfile | null) => void;
  /** Owner set, threshold, legacy/deployed state and execution mode for this Safe */
  safeConfig: SafeConfig | null;
  /** Re-resolve the Safe record from the backend (after onboarding/upgrade/settings changes) */
  refreshSafe: () => void;
  /**
   * Authoritative onboarding-completed flag from the backend record — already
   * fetched to resolve the address, so no extra round-trip. `null` until the
   * record loads (or for brand-new users with no record yet).
   */
  recordOnboardingCompleted: boolean | null;
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

  // The embedded Privy wallet, when one exists (Google / no-wallet logins).
  const embeddedWallet = useMemo(
    () => wallets.find((w) => w.walletClientType === "privy"),
    [wallets]
  );

  // The external wallet the user AUTHENTICATED with (wallet login) — the one
  // Privy records in linkedAccounts. Backup keys are connected but never linked
  // (BackupAddressPicker uses connectWallet), so they never appear here.
  const linkedExternalAddress = useMemo(() => {
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

  // Owner #1 / the signer: the embedded wallet if there is one, otherwise the
  // connected external wallet used to log in. A wallet-login user has no
  // embedded wallet — their connected wallet is the signer.
  const primaryWallet = useMemo(() => {
    if (embeddedWallet) return embeddedWallet;
    if (!linkedExternalAddress) return undefined;
    return wallets.find(
      (w) =>
        w.walletClientType !== "privy" &&
        w.address.toLowerCase() === linkedExternalAddress.toLowerCase()
    );
  }, [embeddedWallet, wallets, linkedExternalAddress]);

  // Authenticated by connecting an external wallet (not Google + embedded).
  // Such users must NEVER have an embedded wallet minted for them.
  const isWalletLogin = !embeddedWallet && !!linkedExternalAddress;

  useEffect(() => {
    if (!ready || !authenticated || primaryWallet) return;
    // Wallet-login users sign with their connected wallet — minting an embedded
    // wallet here would violate "use the wallet connected as signer".
    // `createOnLogin: "users-without-wallets"` already prevents it; this guard
    // also closes the race before the external wallet populates `wallets`.
    if (isWalletLogin) return;
    if (hasAttemptedCreate.current) return;
    hasAttemptedCreate.current = true;
    createWallet().catch((e) => {
      console.error("Privy createWallet failed:", e);
      hasAttemptedCreate.current = false;
    });
  }, [ready, authenticated, primaryWallet, isWalletLogin, createWallet]);

  // Switch the signer wallet (embedded or connected external) to the app chain.
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

  // The session's signer IDENTITY — stable across extension account switches.
  // Embedded users: the Privy wallet. Wallet-login users: the SIWE-linked
  // address, even while a different account is active in the extension —
  // identity must not flicker with the active account. Signing AVAILABILITY
  // is primaryWallet's concern, surfaced as `signerMismatch`.
  const wallet: AuthWallet | null = useMemo(() => {
    if (embeddedWallet?.address) return { address: embeddedWallet.address };
    if (linkedExternalAddress) return { address: linkedExternalAddress };
    return null;
  }, [embeddedWallet, linkedExternalAddress]);

  // Which wallet product signs for a wallet-login user — Privy reports the
  // wallet's own EIP-6963 name/icon on the connected wallet object.
  const signerWalletMeta: SignerWalletMeta | null = useMemo(() => {
    if (!primaryWallet || primaryWallet.walletClientType === "privy") return null;
    return {
      name: primaryWallet.meta?.name ?? primaryWallet.walletClientType,
      icon: primaryWallet.meta?.icon,
      clientType: primaryWallet.walletClientType,
    };
  }, [primaryWallet]);

  // ── Wrong-account detection (wallet login) ─────────────────────────────────
  // Privy's injected connector tracks the extension's ACTIVE account: switching
  // accounts REPLACES the signer's entry in `wallets`, so `primaryWallet`
  // disappears while the session stays authenticated. Surface that as an
  // explicit state instead of an indefinite `loading`.

  // Last-known signer brand — survives the signer dropping out of `wallets`
  // so the mismatch UI can still name the wallet product.
  const [lastSignerMeta, setLastSignerMeta] = useState<SignerWalletMeta | null>(null);
  useEffect(() => {
    if (signerWalletMeta) setLastSignerMeta(signerWalletMeta);
  }, [signerWalletMeta]);

  // The external wallet currently active in the extension. Prefer the product
  // the user signed in with — a connected backup wallet (different product)
  // must not masquerade as the signer.
  const activeExternalWallet = useMemo(() => {
    const externals = wallets.filter((w) => w.walletClientType !== "privy");
    if (externals.length === 0) return undefined;
    return (
      externals.find((w) => w.walletClientType === lastSignerMeta?.clientType) ??
      externals[0]
    );
  }, [wallets, lastSignerMeta]);

  // No external wallet at all is ambiguous — Privy may still be reconnecting,
  // or the extension is locked/disconnected. Give reconnection a grace window
  // before surfacing the blocked state.
  const signerUnavailable =
    ready && authenticated && isWalletLogin && !primaryWallet && !activeExternalWallet;
  const [signerUnavailableTimedOut, setSignerUnavailableTimedOut] = useState(false);
  useEffect(() => {
    if (!signerUnavailable) {
      setSignerUnavailableTimedOut(false);
      return;
    }
    const t = setTimeout(() => setSignerUnavailableTimedOut(true), 6000);
    return () => clearTimeout(t);
  }, [signerUnavailable]);

  // (The mismatch itself is computed below, after safeConfig — whether the
  // active account warrants a warning depends on the Safe's owner set.)

  // Brand shown in the UI: live while the signer is connected, last-known
  // during a mismatch — the signer row keeps naming its wallet product even
  // while the extension is on another account.
  const displayedSignerMeta = signerWalletMeta ?? lastSignerMeta;

  // Re-open the active extension's account picker so the user can hop back to
  // the signer. Recovery itself is reactive (accountsChanged clears the
  // mismatch) — this just saves them digging through the extension UI.
  const requestSignerSwitch = useCallback(async (): Promise<boolean> => {
    if (!activeExternalWallet) return false;
    try {
      const provider = await activeExternalWallet.getEthereumProvider();
      await provider.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
      return true;
    } catch (e) {
      console.warn("wallet_requestPermissions failed:", e);
      return false;
    }
  }, [activeExternalWallet]);

  // Backup key (owner #2) chosen this session — pasted, ENS-resolved, or read
  // from a signature-free wallet connection. Held locally until the user-sync
  // persists it to the record; deliberately NOT a Privy link, so the same
  // backup wallet can serve any number of accounts.
  const [backupAddressOverride, setBackupAddressState] = useState<string | null>(null);
  const setBackupAddress = useCallback((addr: string | null) => {
    setBackupAddressState(addr);
  }, []);

  // Legacy backup fallback: a wallet linked before the signature-free picker
  // existed. Only a backup when there IS an embedded signer — for a wallet-login
  // user the linked external wallet is the SIGNER, not a backup key.
  const privyLinkedExternal = embeddedWallet ? linkedExternalAddress : null;

  // Loading waits for IDENTITY (embedded-wallet creation / linked accounts),
  // never for signer availability — a wallet-login session with the wrong
  // account active renders normally with `signerMismatch` set, instead of
  // stranding the user on an unexplained spinner.
  const loading = !ready || (authenticated && !wallet);

  const login = useCallback(() => {
    privyLogin();
  }, [privyLogin]);

  const logout = useCallback(async () => {
    // A logged-out machine keeps no identity residue — both caches rebuild
    // from the backend record on the next login.
    clearOnboardingCompleteCookie();
    clearOnboardingStorage();
    clearIdentityCache();
    await privyLogout();
  }, [privyLogout]);

  const [safeRefreshKey, setSafeRefreshKey] = useState(0);
  const refreshSafe = useCallback(() => setSafeRefreshKey((k) => k + 1), []);

  // New users' records are only persisted after they explicitly confirm the
  // backup-key step — until then the chosen address can be freely swapped
  // (the record's safe_address is a primary key; a premature write locks the
  // owner set in).
  const [safeCommitted, setSafeCommitted] = useState(false);
  const commitSafe = useCallback(() => setSafeCommitted(true), []);

  // Creation profile chosen during onboarding — drives NEW-user derivation
  // (returning users resolve from their record; this is ignored for them).
  const [pendingProfile, setPendingProfile] = useState<WalletProfile | null>(null);

  // Owner #2 candidate for NEW-user derivation (returning users resolve from
  // their record inside the hook, so this input is ignored for them).
  const externalAddressInput = backupAddressOverride ?? privyLinkedExternal;

  const {
    safeAddress,
    loading: safeLoading,
    record: safeRecord,
    derived: safeDerived,
    derivationVersion,
    derivedOwners,
    derivedThreshold,
  } = useSafeAddress({
    embeddedAddress: wallet?.address,
    profile: pendingProfile,
    externalAddress: externalAddressInput ?? undefined,
    identityToken,
    privyUserId: privyUser?.id,
    refreshKey: safeRefreshKey,
  });

  // Effective backup key: the persisted record wins, then this session's
  // manual choice, then a legacy Privy-linked wallet.
  const externalWalletAddress =
    safeRecord?.external_wallet_address ?? externalAddressInput;
  // Once the record holds it, the backup key is part of the derived/deployed
  // Safe — swapping it is an on-chain owner change, not a UI toggle.
  const backupAddressLocked = !!safeRecord?.external_wallet_address;

  const agentAddress = process.env.NEXT_PUBLIC_AGENT_ADDRESS;

  const safeConfig: SafeConfig | null = useMemo(() => {
    if (!safeAddress || !agentAddress) return null;
    let owners: string[];
    let threshold: number;
    let deployed: boolean;
    if (safeRecord) {
      owners =
        safeRecord.safe_owners ??
        // Legacy record without stored owners: reconstruct the old 2-of-2 set.
        (safeRecord.signer_address ? [safeRecord.signer_address, agentAddress] : []);
      threshold = safeRecord.safe_threshold ?? 2;
      deployed = safeRecord.safe_deployed ?? false;
    } else if (derivedOwners && derivedThreshold) {
      // Freshly derived Safe (record not created yet) — server-built recipe.
      owners = derivedOwners;
      threshold = derivedThreshold;
      deployed = false;
    } else {
      return null;
    }
    const profile = classifyProfile(owners, threshold, agentAddress);
    return {
      owners,
      threshold,
      profile,
      legacy: profile === "guarded",
      deployed,
      derivationVersion: derivationVersion ?? null,
    };
  }, [safeAddress, safeRecord, derivedOwners, derivedThreshold, agentAddress, derivationVersion]);

  // The active account may itself be part of this Safe — switching to the
  // backup key is a legitimate co-signing setup, not a mistake — so only
  // accounts OUTSIDE the known owner set warrant a warning.
  const activeIsOwner = useMemo(() => {
    if (!activeExternalWallet) return false;
    const active = activeExternalWallet.address.toLowerCase();
    const known = [
      ...(safeConfig?.owners ?? []),
      ...(externalWalletAddress ? [externalWalletAddress] : []),
    ];
    return known.some((o) => o.toLowerCase() === active);
  }, [activeExternalWallet, safeConfig, externalWalletAddress]);

  const signerMismatch: SignerMismatch | null = useMemo(() => {
    if (!ready || !authenticated || !isWalletLogin || primaryWallet) return null;
    if (!linkedExternalAddress) return null;
    if (activeExternalWallet) {
      if (activeIsOwner) return null;
      // A non-owner account is active — detectable immediately. Name the
      // ACTIVE product: that's whose picker requestSignerSwitch opens.
      return {
        expected: linkedExternalAddress,
        active: activeExternalWallet.address,
        walletName: activeExternalWallet.meta?.name ?? lastSignerMeta?.name ?? null,
      };
    }
    if (signerUnavailableTimedOut) {
      // Locked or disconnected — surfaced only after the grace window.
      return {
        expected: linkedExternalAddress,
        active: null,
        walletName: lastSignerMeta?.name ?? null,
      };
    }
    return null;
  }, [
    ready,
    authenticated,
    isWalletLogin,
    primaryWallet,
    linkedExternalAddress,
    activeExternalWallet,
    activeIsOwner,
    signerUnavailableTimedOut,
    lastSignerMeta,
  ]);

  // Wallet rendered in signer rows: the ACTIVE connected wallet when one
  // exists — a switched account shows as itself (warning beside it when it
  // isn't an owner) — otherwise the pinned signer identity.
  const signerDisplay: SignerDisplay | null = useMemo(() => {
    if (embeddedWallet?.address) return { address: embeddedWallet.address, meta: null };
    if (primaryWallet) return { address: primaryWallet.address, meta: signerWalletMeta };
    if (activeExternalWallet) {
      return {
        address: activeExternalWallet.address,
        meta: {
          name: activeExternalWallet.meta?.name ?? activeExternalWallet.walletClientType,
          icon: activeExternalWallet.meta?.icon,
          clientType: activeExternalWallet.walletClientType,
        },
      };
    }
    if (linkedExternalAddress) return { address: linkedExternalAddress, meta: lastSignerMeta };
    return null;
  }, [embeddedWallet, primaryWallet, signerWalletMeta, activeExternalWallet, linkedExternalAddress, lastSignerMeta]);

  useEffect(() => {
    // The signer address is load-bearing: it's the ONLY key `/users/by-signer`
    // can find this account by. Never sync without it — a row written with a
    // null signer_address is invisible to that lookup forever, so the user is
    // treated as new on return and bounced back into onboarding.
    if (!safeAddress || !identityToken || !wallet?.address || hasSyncedUser.current)
      return;
    // Freshly derived Safes wait for the onboarding commit; record-backed
    // users sync immediately as before.
    if (safeDerived && !safeCommitted) return;
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
    })
      .then((res) => {
        // Re-arm on a server error so signer_address isn't left unset forever.
        if (!res.ok) hasSyncedUser.current = false;
      })
      .catch((e) => {
        console.error("Failed to sync user details:", e);
        hasSyncedUser.current = false;
      });
  }, [
    safeAddress,
    identityToken,
    privyUser,
    telegramUserId,
    wallet?.address,
    safeDerived,
    safeCommitted,
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

  // Signer for the backup key (owner #2) — only available while that wallet
  // has an active connection session (screening-off co-signing needs it).
  // Returns null when the backup is a pasted/cold address with no session.
  const getBackupAccount = useCallback(async (): Promise<LocalAccount | null> => {
    if (!externalWalletAddress) return null;
    const backupWallet = wallets.find(
      (w) =>
        w.walletClientType !== "privy" &&
        w.address.toLowerCase() === externalWalletAddress.toLowerCase()
    );
    if (!backupWallet) return null;
    try {
      await backupWallet.switchChain(bsc.id).catch(() => {});
      const provider = await backupWallet.getEthereumProvider();
      const walletAddress = backupWallet.address as Address;
      const walletClient = createWalletClient({
        account: walletAddress,
        chain: bsc,
        transport: custom(provider),
      });
      return { ...walletClient, address: walletAddress } as unknown as LocalAccount;
    } catch (e) {
      console.error("getBackupAccount failed:", e);
      return null;
    }
  }, [wallets, externalWalletAddress]);

  const value: AuthContextType = useMemo(
    () => ({
      user,
      wallet,
      loading,
      login,
      logout,
      getOwnerAccount,
      getBackupAccount,
      safeAddress,
      safeLoading,
      signerWalletMeta: displayedSignerMeta,
      signerMismatch,
      signerDisplay,
      requestSignerSwitch,
      externalWalletAddress,
      setBackupAddress,
      backupAddressLocked,
      commitSafe,
      pendingProfile,
      setPendingProfile,
      safeConfig,
      refreshSafe,
      recordOnboardingCompleted: safeRecord?.onboarding_completed ?? null,
      telegramUserId,
      privyUser: privyUser ?? null,
      identityToken: identityToken ?? null,
    }),
    [user, wallet, loading, login, logout, getOwnerAccount, getBackupAccount, safeAddress, safeLoading, displayedSignerMeta, signerMismatch, signerDisplay, requestSignerSwitch, externalWalletAddress, setBackupAddress, backupAddressLocked, commitSafe, pendingProfile, safeConfig, refreshSafe, safeRecord, telegramUserId, privyUser, identityToken]
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
