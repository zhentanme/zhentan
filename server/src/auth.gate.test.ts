/**
 * #134 table-driven gate test: for EVERY MCP-exposed route, a
 * gateway-authenticated but UNLINKED telegram caller must short-circuit in
 * the auth middleware with the `auth_required` envelope — before any route
 * handler (and therefore any account-scoped read) runs. Invalid identities
 * stay 403 and never mint codes; linked callers pass through untouched.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

vi.mock("./lib/privy.js", () => ({
  verifyPrivyToken: vi.fn(async () => {
    throw new Error("bad token");
  }),
}));
vi.mock("./lib/supabase/index.js", () => ({
  getUserBySignerAddress: vi.fn(async () => null),
}));
vi.mock("./lib/caller.js", () => ({
  // telegram:111 is LINKED; every other telegram id is valid-but-unbound.
  getSafeAddressFromCallerId: vi.fn(async (callerId?: string) =>
    callerId === "telegram:111" ? "0xabc0000000000000000000000000000000000abc" : null
  ),
}));
vi.mock("./lib/telegram/linking.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("./lib/telegram/linking.js")>();
  return {
    ...real,
    issueLinkCode: vi.fn(async () => ({
      code: "test-code",
      expiresAt: new Date(Date.now() + 15 * 60_000),
    })),
  };
});

import { makeAuth } from "./auth.js";
import { issueLinkCode } from "./lib/telegram/linking.js";

const AGENT_SECRET = "test-agent-secret";

/** Every route the MCP tools can reach through the shared auth middleware. */
const MCP_ROUTES = [
  "/transactions",
  "/queue",
  "/execute",
  "/requests",
  "/invoices",
  "/status",
  "/rules",
  "/resolve",
  "/analyze",
  "/events",
  "/users",
  "/swap",
  "/safe",
  "/campaigns",
  "/telegram",
  "/me",
  "/notify-resolve",
  "/bot-start",
];

let server: Server;
let baseUrl: string;
const handlerHits: string[] = [];

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  const auth = makeAuth({ agentSecret: AGENT_SECRET, devOpen: false });
  for (const path of MCP_ROUTES) {
    app.all(path, auth, (_req, res) => {
      handlerHits.push(path);
      res.json({ handler: path });
    });
  }
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  handlerHits.length = 0;
  vi.mocked(issueLinkCode).mockClear();
});

function call(path: string, callerId?: string, init?: RequestInit) {
  const qs = callerId ? `?callerId=${encodeURIComponent(callerId)}` : "";
  return fetch(`${baseUrl}${path}${qs}`, {
    headers: { Authorization: `Bearer ${AGENT_SECRET}` },
    ...init,
  });
}

describe("telegram gate over every MCP-exposed route", () => {
  it("short-circuits UNLINKED callers with the auth_required envelope before any handler", async () => {
    for (const path of MCP_ROUTES) {
      const res = await call(path, "telegram:222");
      expect(res.status, path).toBe(403);
      const body = await res.json();
      expect(body.error, path).toBe("auth_required");
      expect(body.verification_uri, path).toContain("/link?code=");
      expect(typeof body.relay, path).toBe("string");
      expect(body.relay, path).toContain(body.verification_uri);
    }
    expect(handlerHits).toEqual([]); // ZERO account information from any tool
  });

  it("keeps invalid identity distinct from unlinked — 403, and no code minted", async () => {
    for (const callerId of ["telegram:", "telegram:abc", "telegram:-100123"]) {
      const res = await call("/transactions", callerId);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).not.toBe("auth_required");
      expect(body.verification_uri).toBeUndefined();
    }
    expect(issueLinkCode).not.toHaveBeenCalled();
    expect(handlerHits).toEqual([]);
  });

  it("passes LINKED callers through to the handler unchanged", async () => {
    const res = await call("/transactions", "telegram:111");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ handler: "/transactions" });
    expect(issueLinkCode).not.toHaveBeenCalled();
  });

  it("leaves requests with no callerId to route-level authorization (unchanged behavior)", async () => {
    const res = await call("/transactions");
    expect(res.status).toBe(200); // the stub handler; real routes 403 via requireCallerSafe
    expect(issueLinkCode).not.toHaveBeenCalled();
  });

  it("issues from body metadata when the mandatory bot-start call carries it", async () => {
    const res = await call("/bot-start", undefined, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        callerId: "telegram:222",
        chatId: "222",
        telegramUsername: "koshik",
        telegramName: "Koshik",
      }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("auth_required");
    expect(issueLinkCode).toHaveBeenCalledWith({
      telegramUserId: "222",
      chatId: "222",
      username: "koshik",
      name: "Koshik",
    });
  });

  it("repeat calls from the same unlinked chat return the identical envelope", async () => {
    const first = await (await call("/requests", "telegram:333")).json();
    const second = await (await call("/status", "telegram:333")).json();
    expect(second.verification_uri).toBe(first.verification_uri);
    expect(second.relay).toBe(first.relay);
  });

  it("rejects a wrong bearer outright (401) without resolving principals", async () => {
    const res = await fetch(`${baseUrl}/transactions?callerId=telegram:222`, {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
    expect(issueLinkCode).not.toHaveBeenCalled();
  });
});
