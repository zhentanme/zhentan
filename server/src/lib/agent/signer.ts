/**
 * The agent's Safe signing stack, in two deliberate layers:
 *
 *   KeySigner            — raw digest signing. PRIVATE to this module: the
 *                          interface and every implementation are
 *                          deliberately not exported, and lint:layering bans
 *                          signHash(/signDigest( outside this file. A
 *                          raw-hash surface exposed any wider is a signing
 *                          oracle.
 *   SafeSigningAuthority — the only surface callers see. Takes the complete
 *                          SafeTx plus a signing purpose, recomputes the
 *                          EIP-712 hash itself, and refuses before the key
 *                          ever sees a digest.
 *
 * The request is the future service boundary (D4 remote signing): purpose,
 * transaction linkage, Safe context, and typed decision evidence are all
 * carried now. Only the hash recomputation and the purpose's structural
 * rules are enforced here; the full evidence checklist (local decision
 * records, user-approval evidence, chain-sourced owners) arrives with D4 —
 * into a shape that never has to change.
 */
import type { Hex } from "viem";
import { EthSafeSignature } from "@safe-global/protocol-kit";
import type { SafeSignature } from "@safe-global/types-kit";
import type { SafeTxData } from "../../types.js";
import { computeSafeTxHash, getProtocolKit } from "../safe/service.js";
import { getAgentAddress } from "../safe/relayer.js";

/** Raw digest signer. NOT exported — see module doc. */
interface KeySigner {
  getAddress(): string;
  /** Signs a raw 32-byte digest; returns Safe eth_sign-adjusted signature bytes. */
  signDigest(hash: Hex): Promise<Hex>;
}

export type SigningPurpose = "execution" | "rejection" | "draft_finalization";

/** Screening/authorization evidence. Typed now, enforced at D4. */
export interface DecisionEvidence {
  riskScore?: number;
  riskVerdict?: "APPROVE" | "REVIEW" | "BLOCK";
  decidedAt?: string;
  /** D0.2 decision-record linkage (input hash of what was screened). */
  decisionId?: string;
  inputHash?: string;
  /** Required for REVIEW-band signs from D4 onward. */
  userApproval?: { approvedBy: string; approvedAt: string };
}

export interface SafeSigningRequest {
  /** What this signature authorizes. Verified per-purpose (fully at D4). */
  purpose: SigningPurpose;
  safeAddress: string;
  /** Complete SafeTx fields, nonce included — the hash is recomputed from these. */
  safeTx: SafeTxData;
  /** The hash the caller believes it is asking to have signed. */
  expectedSafeTxHash: string;
  /** Transaction-record linkage; version becomes load-bearing at D0.2/D4. */
  transactionId?: string;
  transactionVersion?: number;
  /** Safe context for independent verification (chain-sourced at D4). */
  owners?: string[];
  threshold?: number;
  /** Assignment identity (D0.3); "shared-agent" until P7/F1. */
  agentInstanceId?: string;
  decisionEvidence?: DecisionEvidence;
  policyVersion?: string;
  expiresAt?: string;
}

export interface SigningResult {
  signature: SafeSignature;
  signedBy: string;
}

export interface SafeSigningAuthority {
  sign(request: SafeSigningRequest): Promise<SigningResult>;
}

/**
 * Env-key implementation. Delegates to protocol-kit's signHash so the
 * signature bytes are identical to the pre-refactor path by construction
 * (eth_sign v-adjustment included) — this class reimplements nothing.
 */
class ProtocolKitKeySigner implements KeySigner {
  constructor(private readonly safeAddress: string) {}

  getAddress(): string {
    return getAgentAddress();
  }

  async signDigest(hash: Hex): Promise<Hex> {
    const protocolKit = await getProtocolKit(this.safeAddress);
    const sig = await protocolKit.signHash(hash);
    return sig.data as Hex;
  }
}

/**
 * A rejection is always the empty self-call at the contested nonce — any
 * other payload under the "rejection" purpose is a category error, refused
 * before hashing is even considered.
 */
function assertPurposeShape(request: SafeSigningRequest): void {
  if (request.purpose !== "rejection") return;
  const { safeTx, safeAddress } = request;
  const isEmptySelfCall =
    safeTx.to.toLowerCase() === safeAddress.toLowerCase() &&
    safeTx.value === "0" &&
    safeTx.data === "0x" &&
    safeTx.operation === 0;
  if (!isEmptySelfCall) {
    throw new Error(
      "Signing refused: rejection purpose requires the empty self-call cancel transaction"
    );
  }
}

export class LocalSafeSigningAuthority implements SafeSigningAuthority {
  /** The factory parameter exists for tests; production uses the default. */
  constructor(
    private readonly keySignerFor: (safeAddress: string) => KeySigner = (safeAddress) =>
      new ProtocolKitKeySigner(safeAddress)
  ) {}

  async sign(request: SafeSigningRequest): Promise<SigningResult> {
    assertPurposeShape(request);
    const recomputed = computeSafeTxHash(request.safeAddress, request.safeTx);
    if (recomputed.toLowerCase() !== request.expectedSafeTxHash.toLowerCase()) {
      throw new Error(
        `Signing refused: recomputed SafeTx hash ${recomputed} does not match requested ${request.expectedSafeTxHash}`
      );
    }
    const keySigner = this.keySignerFor(request.safeAddress);
    const data = await keySigner.signDigest(recomputed);
    const signedBy = keySigner.getAddress();
    return { signature: new EthSafeSignature(signedBy, data), signedBy };
  }
}

let authority: SafeSigningAuthority | null = null;

export function getSigningAuthority(): SafeSigningAuthority {
  if (!authority) authority = new LocalSafeSigningAuthority();
  return authority;
}
