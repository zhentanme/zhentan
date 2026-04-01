"use client";

import { getIdentityToken } from "@privy-io/react-auth";
import { useCallback, useMemo } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { transactionsApi } from "./transactions";
import { statusApi } from "./status";
import { invoicesApi } from "./invoices";
import { executeApi } from "./execute";
import { queueApi } from "./queue";
import { resolveApi } from "./resolve";
import { portfolioApi } from "./portfolio";
import { usersApi } from "./users";
import { campaignsApi } from "./campaigns";
import { tokensApi } from "./tokens";

/** A bound fetch function with BASE prepended — passed to each API module. */
export type ApiFetchFn = (path: string, init?: RequestInit) => Promise<Response>;

const BASE = (
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001"
).replace(/\/$/, "");

async function resolveToken(token?: string | null): Promise<string | null> {
  if (token) return token;
  try {
    return (await getIdentityToken()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Low-level fetch with auth. Used by API modules and lib functions (propose.ts, etc.)
 * Path is relative to BACKEND_BASE (e.g. "/queue", "/status?safe=0x...").
 */
export async function apiFetch(
  path: string,
  token: string | null | undefined,
  init: RequestInit = {}
): Promise<Response> {
  const resolved = await resolveToken(token);
  const headers = new Headers(init.headers);
  if (resolved) headers.set("Authorization", `Bearer ${resolved}`);
  return fetch(`${BASE}${path}`, { ...init, headers });
}

/**
 * React hook — returns a namespaced API client with auth pre-injected.
 * Components use this instead of calling apiFetch directly.
 *
 * @example
 * const api = useApiClient();
 * const { transactions } = await api.transactions.list(safeAddress);
 * await api.status.update({ safe: safeAddress, screeningMode: true });
 */
export function useApiClient() {
  const { identityToken } = useAuth();

  const req: ApiFetchFn = useCallback(
    (path, init) => apiFetch(path, identityToken, init),
    [identityToken]
  );

  return useMemo(
    () => ({
      transactions: transactionsApi(req),
      status: statusApi(req),
      invoices: invoicesApi(req),
      execute: executeApi(req),
      queue: queueApi(req),
      resolve: resolveApi(req),
      portfolio: portfolioApi(req),
      users: usersApi(req),
      campaigns: campaignsApi(req),
      tokens: tokensApi(req),
    }),
    [req]
  );
}
