/**
 * The agent's Safe signing stack, in two deliberate layers:
 *
 *   KeySigner            — raw digest signing. PRIVATE to this module: nothing
 *                          else may accept or transport a bare hash for
 *                          signing. A raw-hash surface exposed any wider is a
 *                          signing oracle.
 *   SafeSigningAuthority — the only surface callers see. Takes the complete
 *                          SafeTx, recomputes the EIP-712 hash itself, and
 *                          refuses on mismatch before the key ever sees a
 *                          digest.
 *
 * The request already carries decision-evidence fields (screening decision,
 * policy version, expiry). They are NOT enforced here yet — full verification
 * arrives with remote signing (D4) — but the shape is fixed now so the
 * service boundary never has to change.
 */
import type { Hex } from "viem";
import { EthSafeSignature } from "@safe-global/protocol-kit";
import type { SafeSignature } from "@safe-global/types-kit";
import type { SafeTxData } from "../../types.js";
import { computeSafeTxHash, getProtocolKit } from "../safe/service.js";
import { getAgentAddress } from "../safe/relayer.js";

export interface KeySigner {
  getAddress(): string;
  /** Signs a raw 32-byte digest; returns Safe eth_sign-adjusted signature bytes. */
  signDigest(hash: Hex): Promise<Hex>;
}

export interface SafeSigningRequest {
  safeAddress: string;
  /** Complete SafeTx fields, nonce included — the hash is recomputed from these. */
  safeTx: SafeTxData;
  /** The hash the caller believes it is asking to have signed. */
  expectedSafeTxHash: string;
  /** Carried now, enforced at D4 (remote signing). */
  decisionEvidence?: unknown;
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

export class LocalSafeSigningAuthority implements SafeSigningAuthority {
  constructor(
    private readonly keySignerFor: (safeAddress: string) => KeySigner = (safeAddress) =>
      new ProtocolKitKeySigner(safeAddress)
  ) {}

  async sign(request: SafeSigningRequest): Promise<SigningResult> {
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
