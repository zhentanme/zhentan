/**
 * SafeSigningAuthority (D4) — the runtime's gate in front of its key.
 * "The agent never signs what it didn't screen" is enforced HERE,
 * cryptographically close to the key, not organizationally in the backend:
 *
 *  - The SafeTx hash is RECOMPUTED from raw fields; the claimed hash is
 *    only ever compared, never signed as-is.
 *  - Owners/threshold/nonce come FROM CHAIN. The payload cannot fabricate
 *    an owner set, and a request for a consumed nonce is refused.
 *  - The screening decision must exist in this runtime's OWN decision
 *    store at the exact tx version. A decision claimed in the payload is
 *    not evidence. Missing record → refuse → the backend must re-screen.
 *  - REVIEW/BLOCK verdicts additionally require approval evidence pinned
 *    to the request's tx version (backend assertion through P6–P8).
 *  - The legacy blind co-sign capability is RE-DERIVED (derivation version
 *    from registry data + owners/threshold from chain) — a payload flag
 *    claiming exemption is worthless.
 *  - Per-purpose rules: a rejection may only be the empty self-call at the
 *    current nonce; draft_finalization signs only against version-pinned
 *    user-approval evidence (drafts are screened inline until the IP).
 *
 * Every refusal is a named reason — refusals are the product here.
 */
import { type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { type SignJobPayload, type SignPurpose } from "zhentan-screening";
import { computeSafeTxHash } from "./safeTxHash.js";
import { readSafeState } from "./chain.js";
import { findDecision } from "./decisionStore.js";

export type SignVerdict =
  | { sign: true; safeTxHash: Hex; signedBy: string }
  | { sign: false; reason: string };

let account: PrivateKeyAccount | null = null;

/** The key never leaves this module; loaded lazily (env-free import). */
function keySigner(): PrivateKeyAccount {
  if (!account) {
    const key = process.env.AGENT_PRIVATE_KEY;
    if (!key) throw new Error("Missing AGENT_PRIVATE_KEY (runtime signing key)");
    account = privateKeyToAccount(key as Hex);
  }
  return account;
}

export function agentAddress(): string {
  return keySigner().address.toLowerCase();
}

export function computeSafeTxHashLocal(payload: SignJobPayload): Hex {
  return computeSafeTxHash(payload.safeAddress, payload.chainId, payload.safeTx);
}

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Full verification. `deps` is injectable for tests; production uses the
 * real chain reader and decision store.
 */
export async function verifySignRequest(
  purpose: SignPurpose,
  payload: SignJobPayload,
  deps = { readSafeState, findDecision, now: () => new Date() }
): Promise<SignVerdict> {

  if (Date.parse(payload.expiresAt) <= deps.now().getTime()) {
    return { sign: false, reason: "sign request expired" };
  }

  const recomputed = computeSafeTxHashLocal(payload);
  if (recomputed.toLowerCase() !== payload.claimedSafeTxHash.toLowerCase()) {
    return { sign: false, reason: "safeTxHash mismatch — claimed hash does not match SafeTx fields" };
  }

  // Chain truth: the payload cannot fabricate any of this.
  const chain = await deps.readSafeState(payload.safeAddress);
  const self = agentAddress();
  if (!chain.owners.includes(self)) {
    return { sign: false, reason: "agent is not an owner of this Safe on-chain" };
  }
  if (payload.safeTx.nonce !== chain.nonce) {
    return {
      sign: false,
      reason: `nonce mismatch — request at ${payload.safeTx.nonce}, chain at ${chain.nonce}`,
    };
  }

  if (purpose === "draft_finalization") {
    // The agent's 1/2 service-mirror signature for its OWN draft, requested
    // at the moment the user signs it. Drafts are screened inline pre-IP,
    // so no runtime decision record exists — the gate is version-pinned
    // user-approval evidence: without the user's sign-off this purpose
    // never produces a signature. (The Intent Proposer later brings drafts
    // into runtime screening and this rule tightens to match execution.)
    const approval = payload.userApproval;
    if (!approval) {
      return { sign: false, reason: "draft_finalization requires user-approval evidence" };
    }
    if (approval.txVersion !== payload.txVersion) {
      return {
        sign: false,
        reason: `approval evidence pinned to version ${approval.txVersion}, request is version ${payload.txVersion}`,
      };
    }
    return { sign: true, safeTxHash: recomputed, signedBy: self };
  }

  if (purpose === "rejection") {
    // A rejection can ONLY be the empty self-call at the current nonce —
    // nothing else is signable under this purpose, decision or not.
    const t = payload.safeTx;
    const shapeOk =
      t.to.toLowerCase() === payload.safeAddress.toLowerCase() &&
      t.value === "0" &&
      t.data === "0x" &&
      t.operation === 0 &&
      t.gasToken === ZERO &&
      t.refundReceiver === ZERO;
    if (!shapeOk) {
      return { sign: false, reason: "rejection purpose requires the empty self-call shape" };
    }
    return { sign: true, safeTxHash: recomputed, signedBy: self };
  }

  // ── purpose: execution ──
  // Legacy blind co-sign capability, RE-DERIVED: v1 derivation (registry
  // data) AND the user's own keys cannot meet the threshold (chain truth).
  const userOwnerCount = chain.owners.filter((o) => o !== self).length;
  const legacyCapability = payload.derivationVersion === 1 && userOwnerCount < chain.threshold;

  if (!legacyCapability) {
    const record = findDecisionOrNull(deps, payload.txId);
    if (!record) {
      return { sign: false, reason: "no local screening record for this transaction — re-screen required" };
    }
    if (record.inputHash === undefined || record.decision === undefined) {
      return { sign: false, reason: "local screening record is incomplete" };
    }
    // CONTENT BINDING (review P1): the record must carry the safeTxHash
    // this runtime computed ITSELF at screen time, and it must equal the
    // hash recomputed for this request. Version numbers move with lifecycle
    // events (a user approval bumps the version by design), but the HASH
    // moves only when the transaction content changes — so this is the
    // property that actually guarantees "never signs what it didn't
    // screen". Records without the binding (pre-D4) refuse → re-screen.
    if (!record.safeTxHash) {
      return { sign: false, reason: "screening record lacks content binding — re-screen required" };
    }
    if (record.safeTxHash.toLowerCase() !== recomputed.toLowerCase()) {
      return {
        sign: false,
        reason: "screening record is for different transaction content — re-screen required",
      };
    }
    const verdict = record.decision.verdict;
    if (verdict === "APPROVE") {
      if (record.txVersion !== payload.txVersion) {
        return {
          sign: false,
          reason: `screening record version ${record.txVersion} does not match request version ${payload.txVersion} — re-screen required`,
        };
      }
    } else {
      // REVIEW/BLOCK: the approval itself bumps the version, so exact
      // version equality with the record is structurally impossible — the
      // content binding above carries the screening guarantee; the checks
      // here pin the APPROVAL: evidence must name THIS version, and the
      // record must predate it (screened, then approved, never reordered).
      const approval = payload.userApproval;
      if (!approval) {
        return { sign: false, reason: `verdict ${verdict} requires user-approval evidence` };
      }
      if (approval.txVersion !== payload.txVersion) {
        return {
          sign: false,
          reason: `approval evidence pinned to version ${approval.txVersion}, request is version ${payload.txVersion}`,
        };
      }
      if (record.txVersion >= payload.txVersion) {
        return { sign: false, reason: "screening record does not predate the approval — inconsistent state" };
      }
    }
  }

  return { sign: true, safeTxHash: recomputed, signedBy: self };
}

function findDecisionOrNull(
  deps: { findDecision: typeof findDecision },
  txId: string
): ReturnType<typeof findDecision> {
  try {
    return deps.findDecision(txId);
  } catch {
    return null;
  }
}

/**
 * Verify, then sign. The raw digest signature (v 27/28) is a Safe
 * EIP-712-type signature over the recomputed hash — the claimed hash never
 * reaches the key.
 */
export async function verifyAndSign(
  purpose: SignPurpose,
  payload: SignJobPayload,
  deps?: Parameters<typeof verifySignRequest>[2]
): Promise<{ ok: true; signature: string; signedBy: string } | { ok: false; reason: string }> {
  const verdict = await verifySignRequest(purpose, payload, deps);
  if (!verdict.sign) return { ok: false, reason: verdict.reason };
  const signature = await keySigner().sign({ hash: verdict.safeTxHash });
  return { ok: true, signature, signedBy: verdict.signedBy };
}
