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

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}
