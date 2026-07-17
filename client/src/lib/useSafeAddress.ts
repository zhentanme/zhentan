"use client";

import { useState, useEffect, useRef } from "react";
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
import { toAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { toSafeSmartAccount } from "permissionless/accounts";

import {
  SAFE_SINGLETON,
  SAFE_PROXY_FACTORY,
  SAFE_VERSION,
  BSC_RPC,
} from "./constants";
import { canonicalOwners, SAFE_2OF3_THRESHOLD } from "./safe/owners";
import { apiFetch } from "./api/client";
import type { UserDetails } from "./api/users";

// Derivation cache keyed on the full owner set — the address depends on
// every owner, so keying on a single owner would poison across changes.
const cache = new Map<string, string>();

export interface SafeResolution {
  safeAddress: string | null;
  loading: boolean;
  /** Backend user record when the address came from the DB (legacy + returning users). */
  record: UserDetails | null;
  /** True when the address was freshly derived (new user, no backend record yet). */
  derived: boolean;
}

interface UseSafeAddressParams {
  /** Privy embedded wallet address (owner #1). */
  embeddedAddress: string | undefined;
  /** Linked external wallet address (owner #2) — required to derive a new Safe. */
  externalAddress: string | undefined;
  /** Privy identity token for the backend lookup. */
  identityToken: string | null | undefined;
  /** Bump to force a re-resolution (e.g. after onboarding or an upgrade). */
  refreshKey?: number;
}

/**
 * Resolves the user's Safe address.
 *
 * 1. Backend record first (`GET /users/by-signer/:embedded`) — returning and
 *    legacy users keep their stored address verbatim; never re-derived.
 * 2. Otherwise derive the 2-of-3 counterfactual address from the canonical
 *    owner set [embedded, external, agent]. Stays `null` until the external
 *    wallet is linked — a 3-owner address cannot exist without owner #2.
 */
export function useSafeAddress({
  embeddedAddress,
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
  });
  const computingRef = useRef<string | null>(null);
  // Bumped to re-run the effect after a failed backend lookup (kept in
  // loading state) so a transient blip doesn't strand the user on a spinner.
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!embeddedAddress) {
      setState({ safeAddress: null, loading: false, record: null, derived: false });
      return;
    }

    const agentAddress = process.env.NEXT_PUBLIC_AGENT_ADDRESS;
    if (!agentAddress) {
      console.error("Missing NEXT_PUBLIC_AGENT_ADDRESS");
      return;
    }

    const computeKey = `${embeddedAddress}|${externalAddress ?? ""}|${identityToken ? "t" : ""}|${refreshKey}|${retry}`;
    if (computingRef.current === computeKey) return;
    computingRef.current = computeKey;

    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    (async (): Promise<SafeResolution> => {
      // 1. Backend record wins — covers legacy 2-of-2 users and returning
      //    2-of-3 users, with owners/threshold/mode as stored. Until the
      //    identity token exists we cannot know whether a record exists, so
      //    stay in the loading state — deriving here would hand a legacy
      //    user a wrong (2-of-3) address.
      if (!identityToken) {
        return { safeAddress: null, loading: true, record: null, derived: false };
      }
      const res = await apiFetch(
        `/users/by-signer/${embeddedAddress}`,
        identityToken
      );
      if (!res.ok) {
        // Transient backend failure: keep loading rather than mis-deriving,
        // and retry shortly.
        console.error(`Safe address backend lookup failed: ${res.status}`);
        setTimeout(() => {
          if (!cancelled) setRetry((r) => r + 1);
        }, 4000);
        return { safeAddress: null, loading: true, record: null, derived: false };
      }
      const data = (await res.json()) as { user: UserDetails | null };
      if (data.user?.safe_address) {
        return {
          safeAddress: data.user.safe_address,
          loading: false,
          record: data.user,
          derived: false,
        };
      }

      // 2. New user: derive the 2-of-3 counterfactual. Requires owner #2.
      if (!externalAddress) {
        return { safeAddress: null, loading: false, record: null, derived: false };
      }

      const owners = canonicalOwners(
        embeddedAddress as `0x${string}`,
        externalAddress as `0x${string}`,
        agentAddress as `0x${string}`
      );
      const cacheKey = owners.join(",").toLowerCase();
      const cached = cache.get(cacheKey);
      if (cached) {
        return { safeAddress: cached, loading: false, record: null, derived: true };
      }

      const publicClient = createPublicClient({
        chain: bsc,
        transport: http(BSC_RPC),
      });

      const account = await toSafeSmartAccount({
        client: publicClient,
        entryPoint: { address: entryPoint07Address, version: "0.7" },
        owners: owners.map((o) => toAccount(o)),
        saltNonce: 0n,
        safeSingletonAddress: SAFE_SINGLETON,
        safeProxyFactoryAddress: SAFE_PROXY_FACTORY,
        version: SAFE_VERSION,
        threshold: BigInt(SAFE_2OF3_THRESHOLD),
      });
      cache.set(cacheKey, account.address);
      return { safeAddress: account.address, loading: false, record: null, derived: true };
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
          setTimeout(() => {
            if (!cancelled) setRetry((r) => r + 1);
          }, 4000);
        }
      })
      .finally(() => {
        computingRef.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [embeddedAddress, externalAddress, identityToken, refreshKey, retry]);

  return state;
}
