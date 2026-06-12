/**
 * Thin HTTP client for the existing Zhentan server API.
 *
 * AGENT_SECRET lives in this process's environment (set via the MCP host's
 * `env` config) — it never enters the model's context. ZHENTAN_API_URL
 * selects the server (defaults to production).
 */

const BASE_URL = (process.env.ZHENTAN_API_URL ?? "https://api.zhentan.me").replace(/\/$/, "");
const AGENT_SECRET = process.env.AGENT_SECRET;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export class ApiTimeoutError extends Error {
  constructor(public readonly path: string) {
    super(`Request to ${path} timed out`);
  }
}

export async function callApi<T = Record<string, unknown>>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
  timeoutMs = 30_000,
): Promise<T> {
  if (!AGENT_SECRET) {
    throw new ApiError(
      "AGENT_SECRET is not set in the MCP server environment. Configure it in the MCP host's env block.",
    );
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
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
    const message = typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
    throw new ApiError(message, res.status);
  }

  return json as T;
}
