/**
 * Sign-job requester (D4) — how the backend obtains the agent's SafeTx
 * signature now that the key lives in the runtime. One request yields ONE
 * signature, reused for both the Transaction Service confirmation and the
 * on-chain assembly (they are the same bytes over the same safeTxHash).
 *
 * The backend verifies what comes back before using it: the result must
 * carry signedBy === AGENT_ADDRESS AND the signature must recover to that
 * address over the expected hash. A runtime cannot substitute another key.
 */
import { supabase } from "../supabase/client.js";
import { enqueueJob, getJob } from "./jobs.js";
import type { SignJobPayload, SignJobResult, SignPurpose } from "zhentan-screening/protocol";
import { getUserDetails } from "../supabase/index.js";
import { getAgentAddress } from "../safe/relayer.js";
import { recoverSafeTxSigner } from "../safe/service.js";
import type { SafeTxData } from "../../types.js";
import type { Hex } from "viem";

export const SIGNING_TIMEOUT_MS = Number(process.env.SIGNING_TIMEOUT_MS || 15_000);
const SIGN_REQUEST_TTL_MS = 2 * 60 * 1000;
const POLL_MS = 200;

export class SignRequestError extends Error {
  constructor(message: string, readonly reason: "refused" | "timeout" | "invalid_result") {
    super(message);
  }
}

export interface SignRequestContext {
  txId: string;
  safeAddress: string;
  safeTx: SafeTxData;
  safeTxHash: string;
  /** REVIEW/BLOCK approval: the backend's assertion, pinned to the version
   *  it reads at request time (P6–P8 threat model; P9 upgrades this). */
  userApproved?: boolean;
}

/**
 * Request the agent signature for a SafeTx through the job protocol and
 * wait for it (bounded). Throws SignRequestError on refusal, timeout, or a
 * result that fails identity verification.
 */
export async function requestAgentSignature(
  purpose: SignPurpose,
  ctx: SignRequestContext
): Promise<{ signature: Hex; signedBy: string }> {
  const { data: row, error } = await supabase
    .from("transactions")
    .select("version")
    .eq("id", ctx.txId)
    .maybeSingle<{ version: number }>();
  if (error) throw new Error(`Sign request version read failed: ${error.message}`);
  const txVersion = row?.version ?? 1;

  // Registry read FAILS CLOSED (review P1): a transient failure or a
  // missing record must never default into legacy privileges — for a
  // 2-of-2 Safe the owner math alone would then authorize a blind co-sign.
  // Failure propagates (request retried later); unknown Safe refuses; a
  // null derivation_version grants NO legacy privileges (explicit v1 from
  // a synced registry row is the only way in).
  const record = await getUserDetails(ctx.safeAddress);
  if (!record) {
    throw new SignRequestError(
      "Unknown Safe — no registry record; refusing to request a signature",
      "refused"
    );
  }
  const payload: SignJobPayload = {
    safeAddress: ctx.safeAddress,
    chainId: 56,
    txId: ctx.txId,
    txVersion,
    safeTx: {
      to: ctx.safeTx.to,
      value: ctx.safeTx.value,
      data: ctx.safeTx.data,
      operation: ctx.safeTx.operation,
      safeTxGas: ctx.safeTx.safeTxGas,
      baseGas: ctx.safeTx.baseGas,
      gasPrice: ctx.safeTx.gasPrice,
      gasToken: ctx.safeTx.gasToken,
      refundReceiver: ctx.safeTx.refundReceiver,
      nonce: ctx.safeTx.nonce,
    },
    claimedSafeTxHash: ctx.safeTxHash,
    derivationVersion: record.derivation_version ?? 2,
    userApproval: ctx.userApproved
      ? { txVersion, approvedAt: new Date().toISOString(), source: "backend" }
      : null,
    expiresAt: new Date(Date.now() + SIGN_REQUEST_TTL_MS).toISOString(),
  };

  const job = await enqueueJob({
    kind: "sign",
    purpose,
    safeAddress: ctx.safeAddress,
    txId: ctx.txId,
    txVersion,
    payload: payload as unknown as Record<string, unknown>,
  });

  const deadline = Date.now() + SIGNING_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const current = await getJob(job.id);
    if (!current) break;
    if (current.status === "succeeded") {
      const result = current.result as { signature?: string; signedBy?: string } | null;
      return verifySignResult(result, ctx.safeTxHash);
    }
    if (current.status === "failed" || current.status === "dead_letter") {
      throw new SignRequestError(
        `Runtime refused to sign (${purpose}): ${current.last_error ?? "unknown reason"}`,
        "refused"
      );
    }
    if (current.status === "void") {
      throw new SignRequestError("Sign request voided — transaction moved on", "refused");
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new SignRequestError(
    `No signature within ${SIGNING_TIMEOUT_MS}ms — runtime unavailable? Transaction stays queued.`,
    "timeout"
  );
}

/** Identity verification: signedBy must be the configured agent AND the
 *  signature must actually recover to it. */
async function verifySignResult(
  result: { signature?: string; signedBy?: string } | null,
  safeTxHash: string
): Promise<{ signature: Hex; signedBy: string }> {
  const agent = getAgentAddress().toLowerCase();
  if (!result?.signature || !result.signedBy) {
    throw new SignRequestError("Sign result missing signature/signedBy", "invalid_result");
  }
  if (result.signedBy.toLowerCase() !== agent) {
    throw new SignRequestError(
      `Sign result signedBy ${result.signedBy} is not the configured agent ${agent}`,
      "invalid_result"
    );
  }
  const recovered = (await recoverSafeTxSigner(safeTxHash as Hex, result.signature as Hex)).toLowerCase();
  if (recovered !== agent) {
    throw new SignRequestError(
      `Signature recovers to ${recovered}, not the configured agent ${agent}`,
      "invalid_result"
    );
  }
  return { signature: result.signature as Hex, signedBy: result.signedBy };
}

export type { SignJobResult };
