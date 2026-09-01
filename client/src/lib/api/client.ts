"use client";

import { getIdentityToken } from "@privy-io/react-auth";
import { useCallback, useMemo } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { transactionsApi } from "./transactions";
import { statusApi } from "./status";
import { requestsApi } from "./requests";
import { executeApi } from "./execute";
import { resolveApi } from "./resolve";
import { portfolioApi } from "./portfolio";
import { usersApi } from "./users";
import { campaignsApi } from "./campaigns";
import { tokensApi } from "./tokens";
import { swapApi } from "./swap";
import { safeApi } from "./safe";
import { settingsApi } from "./settings";
import { telegramApi } from "./telegram";

/** A bound fetch function with BASE prepended — passed to each API module. */
export type ApiFetchFn = (path: string, init?: RequestInit) => Promise<Response>;

/**
 * Turn a failed Response into a user-safe Error. Short server-provided
 * `error`/`message` strings pass through (they're written for users, e.g.
 * "Username already taken"); anything else — HTML error pages, stack traces,
 * proxy bodies — is logged and replaced by `fallback`.
 */
export async function apiError(res: Response, fallback: string): Promise<Error> {
  try {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
      const msg =
        typeof parsed.error === "string"
          ? parsed.error
          : typeof parsed.message === "string"
            ? parsed.message
            : null;
      if (msg && msg.length <= 160) return new Error(msg);
    } catch {
      /* not JSON — fall through to the fallback */
    }
    console.error(`[api] ${res.status} ${res.url}:`, text.slice(0, 300));
  } catch {
    console.error(`[api] ${res.status} ${res.url}: unreadable body`);
  }
  return new Error(fallback);
}

const BASE = (
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001"
).replace(/\/$/, "");

/** Public backend origin — for unauthenticated reads like GET /health. */
export const BACKEND_BASE = BASE;

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
      requests: requestsApi(req),
      execute: executeApi(req),
      resolve: resolveApi(req),
      portfolio: portfolioApi(req),
      users: usersApi(req),
      campaigns: campaignsApi(req),
      tokens: tokensApi(req),
      swap: swapApi(req),
      safe: safeApi(req),
      settings: settingsApi(req),
      telegram: telegramApi(req),
    }),
    [req]
  );
}
