import type { Request, Response } from "express";
import type { PendingTransaction } from "../types.js";
import { getTransaction } from "./supabase/index.js";

/**
 * Object-level authorization: every Safe-scoped route answers "which Safe is
 * this caller allowed to touch?" here, and nowhere else.
 *
 * The principal is resolved exactly once, in `auth()` (index.ts), into
 * `req.callerSafe`:
 *   - Privy client  → the `user_details` row matched on the token's embedded
 *                     wallet address.
 *   - Agent bearer  → `getSafeAddressFromCallerId(req.callerId)`.
 *
 * Two rules follow from that, and both are load-bearing:
 *
 *   1. A `safe` / `safeAddress` / `callerId` field in the request body or query
 *      is NEVER a source of authority. It may be echoed back for validation,
 *      but the Safe that gets read or written is always `req.callerSafe`.
 *   2. An unresolvable principal is a 403, never a pass-through. The old
 *      `if (req.user && …)` guards inverted this: they enforced ownership only
 *      when the row happened to resolve, so a caller with no row bypassed the
 *      check entirely.
 *
 * System-initiated work (risk-engine auto-execute) has no principal by
 * construction and must not travel through these helpers or through HTTP — it
 * calls the in-process executor directly. Authorization is a boundary concern.
 */

/** Case-insensitive address comparison. Addresses reach us in mixed casing. */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * The caller's Safe, or 403. Use on any route that reads or writes Safe-scoped
 * state without naming a target (the target IS the caller's Safe).
 */
export function requireCallerSafe(req: Request, res: Response): string | null {
  if (!req.callerSafe) {
    res.status(403).json({ error: "Forbidden: caller is not linked to a Safe" });
    return null;
  }
  return req.callerSafe;
}

/**
 * The caller's Safe, asserting it matches the `target` the request named.
 * Callers that still send a `safe`/`safeAddress` field keep working as long as
 * it agrees with the principal; a mismatch is a 403.
 */
export function assertOwnsSafe(
  req: Request,
  res: Response,
  target: string | undefined | null
): string | null {
  const safe = requireCallerSafe(req, res);
  if (!safe) return null;
  if (target && !sameAddress(target, safe)) {
    res.status(403).json({ error: "Forbidden: caller does not own this Safe" });
    return null;
  }
  return safe;
}

/**
 * Loads a transaction and asserts the caller owns the Safe it belongs to.
 *
 * A transaction that doesn't exist and one that belongs to someone else both
 * answer 404 — deliberately indistinguishable, so a caller can't probe which
 * transaction ids are real.
 */
export async function assertOwnsTx(
  req: Request,
  res: Response,
  txId: string
): Promise<PendingTransaction | null> {
  const safe = requireCallerSafe(req, res);
  if (!safe) return null;

  const tx = await getTransaction(txId);
  if (!tx || !sameAddress(tx.safeAddress, safe)) {
    res.status(404).json({ error: `Transaction not found: ${txId}` });
    return null;
  }
  return tx;
}
