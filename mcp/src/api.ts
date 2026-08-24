/**
 * Thin HTTP client for the existing Zhentan server API.
 *
 * AGENT_SECRET lives in this process's environment (set via the MCP host's
 * `env` config) — it never enters the model's context. ZHENTAN_API_URL
 * selects the server (defaults to production).
 */

// No default: silently falling back to production means a misconfigured local
// or staging agent operates on real users' Safes. Fail loudly instead.
const BASE_URL = (process.env.ZHENTAN_API_URL ?? "").replace(/\/$/, "");
const AGENT_SECRET = process.env.AGENT_SECRET;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * The server's `auth_required` envelope (#134): the caller's Telegram is not
 * linked to any account, and the ONLY correct behavior is to relay the
 * server-pinned `relay` text verbatim. Preserved as a typed error so every
 * tool surfaces it identically through result.ts — never collapsed into a
 * generic ApiError.
 */
export class AuthRequiredError extends Error {
  constructor(
    /** Exact user-facing text to relay verbatim. */
    public readonly relay: string,
    public readonly verificationUri: string,
    public readonly expiresIn: number,
  ) {
    super("auth_required");
  }
}

export class ApiTimeoutError extends Error {
  constructor(public readonly path: string) {
    super(`Request to ${path} timed out`);
  }
}

/**
 * Appends the caller identity to the query string.
 *
 * Every Safe-scoped route resolves *which user* a call acts for from this, and
 * the server takes it from the query or the body — the query works for all
 * methods, including the ones that send no body.
 */
function withCallerId(path: string, callerId?: string): string {
  if (!callerId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}callerId=${encodeURIComponent(callerId)}`;
}

export async function callApi<T = Record<string, unknown>>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
  timeoutMs = 30_000,
  callerId?: string,
): Promise<T> {
  if (!AGENT_SECRET) {
    throw new ApiError(
      "AGENT_SECRET is not set in the MCP server environment. Configure it in the MCP host's env block.",
    );
  }
  if (!BASE_URL) {
    throw new ApiError(
      "ZHENTAN_API_URL is not set in the MCP server environment. Set it explicitly " +
        "(e.g. https://api.zhentan.me for production, http://localhost:3001 for local).",
    );
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${withCallerId(path, callerId)}`, {
      method,
      headers: {
        Authorization: `Bearer ${AGENT_SECRET}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new ApiTimeoutError(path);
    }
    throw new ApiError(
      `Could not reach the Zhentan server at ${BASE_URL}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(`Server returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`, res.status);
  }

  if (!res.ok) {
    if (json.error === "auth_required" && typeof json.relay === "string") {
      throw new AuthRequiredError(
        json.relay,
        typeof json.verification_uri === "string" ? json.verification_uri : "",
        typeof json.expires_in === "number" ? json.expires_in : 0,
      );
    }
    const message = typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
    throw new ApiError(message, res.status);
  }

  return json as T;
}
