/**
 * Runtime-job WIRE PROTOCOL (D0.2/D1) — the contract shared verbatim by the
 * backend (lib/runtime/jobsPolicy.ts re-exports from here) and the runtime
 * worker. One source for the schema version and the canonical input hash
 * means the two processes can never drift on what they are talking about.
 */
import { createHash } from "crypto";

/** Frozen wire-schema version; results must carry a supported version. */
export const JOB_SCHEMA_VERSION = 1;
export const SUPPORTED_JOB_SCHEMA_VERSIONS: ReadonlySet<number> = new Set([1]);

export type JobKind = "screen" | "sign";
export type SignPurpose = "execution" | "rejection" | "draft_finalization";
export type JobStatus = "pending" | "leased" | "succeeded" | "failed" | "dead_letter" | "void";

/** The job as the runtime receives it from the lease endpoint. */
export interface WireJob {
  id: string;
  schema_version: number;
  kind: JobKind;
  purpose: SignPurpose | null;
  safe_address: string;
  tx_id: string;
  tx_version: number;
  payload: Record<string, unknown>;
  input_hash: string;
  credential_version: number;
  attempt_count: number;
}

/**
 * Sign-job payload (D4). The runtime's signing authority trusts NOTHING in
 * here beyond what it can independently verify: the SafeTx fields are
 * re-hashed and compared against `claimedSafeTxHash`; owners/threshold/
 * nonce come from chain; the screening decision must exist in the
 * runtime's OWN local record; `derivationVersion` is registry data used to
 * re-derive the legacy capability (never a claim of exemption itself).
 */
export interface SignJobPayload {
  safeAddress: string;
  chainId: number;
  txId: string;
  txVersion: number;
  safeTx: SafeTxDataWire;
  claimedSafeTxHash: string;
  /** Registry data: 1 = legacy 4337 initializer, 2 = vanilla Safe. */
  derivationVersion: number;
  /**
   * REVIEW/BLOCK verdicts require approval evidence. Through P6–P8 this is
   * an authenticated backend assertion pinned to the tx version; P9
   * upgrades to a backend-signed capability; long-term a user-signed
   * approval statement.
   */
  userApproval?: { txVersion: number; approvedAt: string; source: "backend" } | null;
  /** Refuse stale requests outright. */
  expiresAt: string;
}

/** SafeTx fields as they travel in job payloads (decimal strings). */
export interface SafeTxDataWire {
  to: string;
  value: string;
  data: string;
  operation: 0 | 1;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: string;
  refundReceiver: string;
  nonce: number;
}

/** What a sign job returns. signedBy is verified by the backend against
 *  the configured AGENT_ADDRESS and the recovered signature. */
export interface SignJobResult {
  signature: string;
  signedBy: string;
}

/** EIP-712 SafeTx type definition — a spec constant, shared so backend and
 *  runtime can never drift on the hash construction. */
export const SAFE_TX_TYPES = {
  SafeTx: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" },
    { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" },
    { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

/** What a runtime submits for a completed job. */
export interface JobResultSubmission {
  jobId: string;
  schemaVersion: number;
  leaseToken: string;
  agentInstanceId: string;
  txId: string;
  txVersion: number;
  inputHash: string;
  policyVersion: string;
  credentialVersion: number;
  result: unknown;
}

/**
 * Canonical input hash: stable-stringified payload, sha256. Computed by the
 * backend at enqueue and by the runtime over the payload it actually
 * evaluated — a mismatch means they did not talk about the same inputs.
 */
export function computeInputHash(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

/**
 * Wire codec for payload values that JSON cannot carry natively. BigInts
 * (decoded calldata amounts) become `{"$bigint":"…"}` at enqueue and are
 * revived before evaluation — both sides hash the WIRE form, so the input
 * hash stays consistent while semantics (numeric comparisons) survive.
 *
 * Collision-safe for ARBITRARY JSON: a user-supplied object that itself
 * carries a `$bigint`/`$escaped` key (possible in extensible fields like
 * recipient customAttributes) is wrapped as `{"$escaped": {…}}` at encode
 * and unwrapped verbatim at decode, so every JSON value round-trips
 * exactly and only encoder-produced markers are ever revived.
 */
export function encodeWireValue(value: unknown): unknown {
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (Array.isArray(value)) return value.map(encodeWireValue);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const encoded = Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, encodeWireValue(v)])
    );
    if ("$bigint" in obj || "$escaped" in obj) {
      return { $escaped: encoded };
    }
    return encoded;
  }
  return value;
}

export function decodeWireValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeWireValue);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === "$bigint" && typeof obj.$bigint === "string") {
      return BigInt(obj.$bigint);
    }
    if (keys.length === 1 && keys[0] === "$escaped" && obj.$escaped !== null && typeof obj.$escaped === "object") {
      // Marker-carrying user object: restore its top level verbatim (no
      // marker interpretation), decode its values recursively.
      return Object.fromEntries(
        Object.entries(obj.$escaped as Record<string, unknown>).map(([k, v]) => [k, decodeWireValue(v)])
      );
    }
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, decodeWireValue(v)]));
  }
  return value;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}
