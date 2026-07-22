"use client";

import type { UserDetails } from "@/lib/api/users";

// Local copy of the signed-in user's backend record (GET /users/by-signer),
// keyed by Privy user id. Strictly a render-first hint: useSafeAddress
// hydrates from it so returning users skip the full-screen loader, then the
// live by-signer response reconciles in the background and overwrites it.
// Never consulted for anything authorization-sensitive on its own, and
// removed wholesale on logout.

const PREFIX = "zhentan_identity_";

interface CachedIdentity {
  /** Signer the record was fetched for — hydration requires an exact match. */
  signerAddress: string;
  record: UserDetails;
  cachedAt: number;
}

/** Last-known record for this Privy user, or null when absent/for another signer. */
export function readIdentityCache(
  privyUserId: string,
  signerAddress: string
): UserDetails | null {
  try {
    const raw = localStorage.getItem(PREFIX + privyUserId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedIdentity>;
    if (parsed.signerAddress?.toLowerCase() !== signerAddress.toLowerCase()) return null;
    if (!parsed.record?.safe_address) return null;
    return parsed.record;
  } catch {
    return null;
  }
}

export function writeIdentityCache(
  privyUserId: string,
  signerAddress: string,
  record: UserDetails
) {
  try {
    const entry: CachedIdentity = { signerAddress, record, cachedAt: Date.now() };
    localStorage.setItem(PREFIX + privyUserId, JSON.stringify(entry));
  } catch {
    // Storage unavailable/full — the cache is best-effort.
  }
}

/** Drop one user's entry — used when the backend explicitly reports no record. */
export function removeIdentityCache(privyUserId: string) {
  try {
    localStorage.removeItem(PREFIX + privyUserId);
  } catch {
    // ignore
  }
}

/** Drop every cached identity — logout hygiene for shared machines. */
export function clearIdentityCache() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}
