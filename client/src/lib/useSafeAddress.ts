"use client";

import { useState, useEffect, useRef } from "react";

import { apiFetch } from "./api/client";
import type { UserDetails } from "./api/users";
import type { WalletProfile } from "./safe/profiles";

// Derivation happens SERVER-SIDE only (POST /safe/derive) — the initializer
// bytes that define a Safe's address live in exactly one place
// (server/src/lib/safe/derive.ts). This cache just avoids repeat calls for
// the same owner set within a session.
interface DerivedEntry {
  safeAddress: string;
  derivationVersion: number;
  owners: string[];
  threshold: number;
}
const cache = new Map<string, DerivedEntry>();

export interface SafeResolution {
  safeAddress: string | null;
  loading: boolean;
  /** Backend user record when the address came from the DB (legacy + returning users). */
  record: UserDetails | null;
  /** True when the address was freshly derived (new user, no backend record yet). */
  derived: boolean;
  /** Derivation version for freshly derived Safes (from the server config). */
  derivationVersion: number | null;
  /** Creation recipe for freshly derived Safes (server-built owner order + threshold). */
  derivedOwners: string[] | null;
  derivedThreshold: number | null;
}

interface UseSafeAddressParams {
  /** Privy embedded wallet address (owner #1). */
  embeddedAddress: string | undefined;
  /** Chosen creation profile — required to derive a new Safe. */
  profile: WalletProfile | null | undefined;
  /** Backup key address (owner #2) — required only for the protected profile. */
  externalAddress: string | undefined;
  /** Privy identity token for the backend calls. */
  identityToken: string | null | undefined;
  /** Bump to force a re-resolution (e.g. after onboarding or an upgrade). */
  refreshKey?: number;
}

/**
 * Resolves the user's Safe address.
 *
 * 1. Backend record first (`GET /users/by-signer/:embedded`) — returning and
 *    legacy users keep their stored address verbatim; never re-derived.
 * 2. Otherwise ask the server to derive the counterfactual address for the
 *    canonical owner set [embedded, external, agent] (`POST /safe/derive`).
 *    Stays `null` until the external wallet is linked — the address cannot
 *    exist without owner #2.
 */
export function useSafeAddress({
  embeddedAddress,
  profile,
  externalAddress,
  identityToken,
  refreshKey = 0,
}: UseSafeAddressParams): SafeResolution {
  // Starts in the loading state: guards must never observe "resolved, no
  // Safe" before the first resolution pass has actually run.
  const [state, setState] = useState<SafeResolution>({
    safeAddress: null,
    loading: true,
    record: null,
    derived: false,
    derivationVersion: null,
    derivedOwners: null,
    derivedThreshold: null,
  });
  const computingRef = useRef<string | null>(null);
  // Bumped to re-run the effect after a failed backend lookup (kept in
  // loading state) so a transient blip doesn't strand the user on a spinner.
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!embeddedAddress) {
      setState({
        safeAddress: null,
        loading: false,
        record: null,
        derived: false,
        derivationVersion: null,
        derivedOwners: null,
        derivedThreshold: null,
      });
      return;
    }

    const agentAddress = process.env.NEXT_PUBLIC_AGENT_ADDRESS;
    if (!agentAddress) {
      console.error("Missing NEXT_PUBLIC_AGENT_ADDRESS");
      return;
    }

    const computeKey = `${embeddedAddress}|${profile ?? ""}|${externalAddress ?? ""}|${identityToken ? "t" : ""}|${refreshKey}|${retry}`;
    if (computingRef.current === computeKey) return;
    computingRef.current = computeKey;

    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    const scheduleRetry = () =>
      setTimeout(() => {
        if (!cancelled) setRetry((r) => r + 1);
      }, 4000);

    (async (): Promise<SafeResolution> => {
      // 1. Backend record wins — covers legacy 2-of-2 users and returning
      //    2-of-3 users, with owners/threshold/derivation as stored. Until
      //    the identity token exists we cannot know whether a record exists,
      //    so stay in the loading state.
      const empty = (loading: boolean): SafeResolution => ({
        safeAddress: null,
        loading,
        record: null,
        derived: false,
        derivationVersion: null,
        derivedOwners: null,
        derivedThreshold: null,
      });

      if (!identityToken) {
        return empty(true);
      }
      const res = await apiFetch(
        `/users/by-signer/${embeddedAddress}`,
        identityToken
      );
      if (!res.ok) {
        // Transient backend failure: keep loading rather than mis-deriving,
        // and retry shortly.
        console.error(`Safe address backend lookup failed: ${res.status}`);
        scheduleRetry();
        return empty(true);
      }
      const data = (await res.json()) as { user: UserDetails | null };
      if (data.user?.safe_address) {
        return {
          safeAddress: data.user.safe_address,
          loading: false,
          record: data.user,
          derived: false,
          derivationVersion: data.user.derivation_version ?? null,
          derivedOwners: null,
          derivedThreshold: null,
        };
      }

      // 2. New user: server-side derivation with the chosen creation profile.
      //    The protected profile also needs the backup key address.
      if (!profile || (profile === "protected" && !externalAddress)) {
        return empty(false);
      }

      const cacheKey = `${profile}|${embeddedAddress}|${externalAddress ?? ""}`.toLowerCase();
      const cached = cache.get(cacheKey);
      if (cached) {
        return {
          safeAddress: cached.safeAddress,
          loading: false,
          record: null,
          derived: true,
          derivationVersion: cached.derivationVersion,
          derivedOwners: cached.owners,
          derivedThreshold: cached.threshold,
        };
      }

      const deriveRes = await apiFetch("/safe/derive", identityToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          embeddedAddress,
          ...(externalAddress && { backupAddress: externalAddress }),
        }),
      });
      if (!deriveRes.ok) {
        const err = await deriveRes.json().catch(() => ({}));
        console.error(
          "Safe derivation failed:",
          (err as { error?: string }).error ?? deriveRes.status
        );
        scheduleRetry();
        return empty(true);
      }
      const derivedData = (await deriveRes.json()) as {
        safeAddress: string;
        owners: string[];
        threshold: number;
        derivationVersion: number;
      };
      cache.set(cacheKey, derivedData);
      return {
        safeAddress: derivedData.safeAddress,
        loading: false,
        record: null,
        derived: true,
        derivationVersion: derivedData.derivationVersion,
        derivedOwners: derivedData.owners,
        derivedThreshold: derivedData.threshold,
      };
    })()
      .then((result) => {
        if (!cancelled) setState(result);
      })
      .catch((err) => {
        // Network-level failure: stay loading — resolving to "no Safe" here
        // would misroute an existing user into onboarding. Retry shortly.
        console.error("Failed to resolve Safe address:", err);
        if (!cancelled) {
          setState((s) => ({ ...s, safeAddress: null, loading: true }));
          scheduleRetry();
        }
      })
      .finally(() => {
        computingRef.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [embeddedAddress, profile, externalAddress, identityToken, refreshKey, retry]);

  return state;
}
