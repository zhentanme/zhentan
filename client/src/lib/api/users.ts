import type { ApiFetchFn } from "./client";

export interface UpsertUserBody {
  safeAddress: string;
  email?: string;
  name?: string;
  telegramId?: string;
  signerAddress?: string;
  username?: string;
  onboardingCompleted?: boolean;
  externalWalletAddress?: string;
  safeOwners?: string[];
  safeThreshold?: number;
  derivationVersion?: number;
}

export interface UserDetails {
  safe_address: string;
  email: string | null;
  telegram_id: string | null;
  name: string | null;
  username: string | null;
  signer_address: string | null;
  onboarding_completed: boolean | null;
  external_wallet_address: string | null;
  safe_owners: string[] | null;
  safe_threshold: number | null;
  safe_deployed: boolean | null;
  safe_deploy_tx_hash: string | null;
  /** 1 = legacy 4337-module initializer, 2 = vanilla Safe. */
  derivation_version: number | null;
  /** Immutable birth certificate — exact derivation inputs; never mutated by upgrades. */
  creation_owners: string[] | null;
  creation_threshold: number | null;
  creation_salt_nonce: string;
  created_at: string;
  updated_at: string;
}

export function usersApi(req: ApiFetchFn) {
  return {
    async get(safeAddress: string): Promise<UserDetails | null> {
      const res = await req(`/users?safe=${safeAddress}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.user ?? null;
    },

    async getBySigner(signerAddress: string): Promise<UserDetails | null> {
      const res = await req(`/users/by-signer/${signerAddress}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.user ?? null;
    },

    async upsert(body: UpsertUserBody): Promise<void> {
      const res = await req("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to save");
      }
    },

    async checkUsername(username: string): Promise<boolean> {
      const res = await req(`/users/check-username?username=${encodeURIComponent(username)}`);
      if (!res.ok) return true; // assume available on error to not block user
      const data = await res.json();
      return (data as { available: boolean }).available;
    },
  };
}
