/**
 * Request authentication + principal resolution, extracted from index.ts so
 * the middleware is testable in isolation (the #134 gate test drives it over
 * every MCP-exposed route).
 *
 * Two principal kinds:
 *   - Agent bearer (shared AGENT_SECRET): `callerId` names which user the
 *     agent acts for; resolved here to `req.callerSafe` and never re-read
 *     from the body by routes.
 *   - Privy identity token: the embedded wallet the token proves resolves
 *     the user row and their Safe.
 *
 * The Telegram enrollment gate (#134) runs HERE, after agent-principal
 * resolution and before any route handler: a valid-but-unbound telegram
 * caller is answered with the `auth_required` envelope; a malformed one is
 * refused without minting anything. See lib/telegram/gate.ts.
 */
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { verifyPrivyToken } from "./lib/privy.js";
import { getSafeAddressFromCallerId } from "./lib/caller.js";
import { getUserBySignerAddress } from "./lib/supabase/index.js";
import type { UserDetailsRow } from "./lib/supabase/types.js";
import { enforceTelegramGate } from "./lib/telegram/gate.js";

declare global {
  namespace Express {
    interface Request {
      callerId?: string;
      /**
       * The one Safe this caller may read or write, resolved server-side from
       * the verified principal. Never populated from a request field — see
       * lib/authz.ts. Undefined means "no Safe", which is a 403, not a pass.
       */
      callerSafe?: string;
      /**
       * The embedded wallet address proven by the Privy token. Survives even
       * when no `user_details` row matches it yet, which is the entire
       * onboarding window — `/users` authorizes against this rather than
       * `user`, since the row it is creating cannot vouch for itself.
       */
      signerAddress?: string;
      /**
       * Populated for authenticated client calls (Privy token).
       * Contains the full user_details row resolved via the embedded wallet address.
       * Undefined for agent calls or when the user hasn't completed onboarding.
       */
      user?: UserDetailsRow;
    }
  }
}

/**
 * Length-independent comparison for shared secrets. `===` on a string leaks the
 * length of the matching prefix through timing, which is enough to recover a
 * secret byte-by-byte over many requests.
 */
export function secretEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on length mismatch; compare against a same-length
  // copy so the answer is always produced in constant time for a given `b`.
  if (left.length !== right.length) {
    crypto.timingSafeEqual(right, right);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

/**
 * Resolves an agent caller's principal. `callerId` names which user the agent is
 * acting for; it is an identity *claim*, resolved here to a Safe and thereafter
 * only ever read from `req.callerSafe`. Routes must not re-read it from the body.
 */
async function resolveAgentPrincipal(req: Request) {
  const callerId = req.body?.callerId ?? (req.query.callerId as string) ?? undefined;
  req.callerId = callerId;
  req.callerSafe = (await getSafeAddressFromCallerId(callerId)) ?? undefined;
}

/** Resolves a Privy caller's principal from a verified identity token. */
async function resolvePrivyPrincipal(req: Request, bearer: string) {
  const { userId, walletAddress } = await verifyPrivyToken(bearer);
  req.callerId = `privy:${userId}`;
  req.signerAddress = walletAddress ?? undefined;

  // Resolve the caller's Safe from their embedded wallet, so routes never need
  // to take it from the body/query.
  if (walletAddress) {
    const user = await getUserBySignerAddress(walletAddress);
    if (user) {
      req.user = user;
      req.callerSafe = user.safe_address;
    }
  }
}

export interface AuthOptions {
  agentSecret: string | undefined;
  /** Dev-only escape hatch — accepts requests without proof (never in prod). */
  devOpen: boolean;
}

export function makeAuth({ agentSecret, devOpen }: AuthOptions) {
  return async function auth(req: Request, res: Response, next: NextFunction) {
    const bearer = req.headers["authorization"]?.replace("Bearer ", "");

    // Dev-only: accept the request without proving anything, but still resolve a
    // principal. Routes authorize against `req.callerSafe`, so skipping straight
    // to next() would 403 every Safe-scoped route and make this mode useless.
    if (devOpen) {
      if (bearer) {
        await resolvePrivyPrincipal(req, bearer).catch(() => undefined);
      }
      if (!req.callerSafe) {
        await resolveAgentPrincipal(req);
        if (await enforceTelegramGate(req, res)) return;
      }
      return next();
    }

    if (!agentSecret) {
      // Unreachable given the boot guard, but a route must never serve traffic on
      // the assumption that a secret exists.
      res.status(503).json({ error: "Service is misconfigured for authentication" });
      return;
    }

    if (!bearer) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Agent call — shared secret.
    if (secretEquals(bearer, agentSecret)) {
      await resolveAgentPrincipal(req);
      if (await enforceTelegramGate(req, res)) return;
      return next();
    }

    // Client call — verify as Privy identity token
    try {
      await resolvePrivyPrincipal(req, bearer);
      return next();
    } catch {
      res.status(401).json({ error: "Unauthorized" });
    }
  };
}
