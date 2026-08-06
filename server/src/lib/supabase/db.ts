/**
 * All database access for Zhentan.
 * Replaces the readFileSync / writeFileSync pattern across all routes.
 */
import { supabase } from "./client.js";
import type {
  TransactionRow,
  UserDetailsRow,
  UserSettingsRow,
  RequestRow,
  GlobalLimitsRow,
  RecipientProfileRow,
  TimePatternRow,
  VelocityWindowRow,
  TokenPatternRow,
  UserRuleRow,
  DailyStatsRow,
  BehavioralEventRow,
  CampaignRow,
  CampaignClaimRow,
} from "./types.js";
import type { PendingTransaction, QueuedRequest } from "../../types.js";

// ─────────────────────────────────────────────────────────────
// Mappers: DB row ↔ app type
// ─────────────────────────────────────────────────────────────

export function rowToTx(row: TransactionRow): PendingTransaction {
  return {
    id: row.id,
    to: row.to_address,
    amount: row.amount,
    token: row.token ?? "",
    direction: (row.direction as PendingTransaction["direction"]) ?? undefined,
    tokenAddress: row.token_address ?? "",
    tokenIconUrl: row.token_icon_url ?? null,
    proposedBy: row.proposed_by ?? "",
    signatures: [],
    ownerAddresses: row.owner_addresses ?? [],
    threshold: row.threshold ?? 2,
    safeAddress: row.safe_address,
    txType: row.tx_type ?? "4337",
    userOp: row.user_op ?? undefined,
    partialSignatures: row.partial_signatures ?? undefined,
    safeTxHash: row.safe_tx_hash ?? undefined,
    safeTx: (row.safe_tx as unknown as PendingTransaction["safeTx"]) ?? undefined,
    safeNonce: row.safe_nonce ?? undefined,
    // Derived, never stored: only agent-proposed drafts lack a hash — every
    // user proposal is required to carry one (validateSafeTxProposal), so
    // this can't drift from the row's actual state. Finalizing (assigning
    // the nonce + hash) is exactly what ends draft-ness.
    draft: row.tx_type === "safetx" && !row.safe_tx_hash ? true : undefined,
    toTokenAddress: row.to_token_address ?? undefined,
    userSignature: row.user_signature ?? undefined,
    userSignatures: row.user_signatures ?? undefined,
    rejectionSignature: row.rejection_signature ?? undefined,
    proposedAt: row.proposed_at,
    executedAt: row.executed_at ?? undefined,
    executedBy: row.executed_by ?? undefined,
    txHash: row.tx_hash ?? undefined,
    success: row.success ?? undefined,
    inReview: row.in_review,
    reviewReason: row.review_reason ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    rejected: row.rejected,
    rejectedAt: row.rejected_at ?? undefined,
    rejectReason: row.reject_reason ?? undefined,
    rejectionStatus: (row.rejection_status as PendingTransaction["rejectionStatus"]) ?? undefined,
    cancelSafeTxHash: row.cancel_safe_tx_hash ?? undefined,
    cancelTxHash: row.cancel_tx_hash ?? undefined,
    cancelAttempts: row.cancel_attempts ?? undefined,
    cancelLastError: row.cancel_last_error ?? undefined,
    cancelNextRetryAt: row.cancel_next_retry_at ?? undefined,
    riskScore: row.risk_score ?? undefined,
    riskVerdict: row.risk_verdict ?? undefined,
    riskReasons: row.risk_reasons ?? undefined,
    screeningDisabled: row.screening_disabled,
    amountUSD: row.amount_usd ?? undefined,
  };
}

function txToRow(tx: PendingTransaction): TransactionRow {
  return {
    id: tx.id,
    safe_address: tx.safeAddress.toLowerCase(),
    to_address: tx.to,
    amount: tx.amount,
    token: tx.token ?? null,
    direction: tx.direction ?? null,
    token_address: tx.tokenAddress ?? null,
    token_icon_url: tx.tokenIconUrl ?? null,
    proposed_by: tx.proposedBy ?? null,
    owner_addresses: tx.ownerAddresses ?? null,
    threshold: tx.threshold ?? null,
    tx_type: tx.txType ?? "4337",
    user_op: tx.userOp ?? null,
    partial_signatures: tx.partialSignatures ?? null,
    safe_tx_hash: tx.safeTxHash ?? null,
    safe_tx: (tx.safeTx as unknown as Record<string, unknown>) ?? null,
    safe_nonce: tx.safeNonce ?? null,
    user_signature: tx.userSignature ?? null,
    user_signatures: tx.userSignatures ?? null,
    rejection_signature: tx.rejectionSignature ?? null,
    confirmations: null,
    proposed_at: tx.proposedAt,
    risk_score: tx.riskScore ?? null,
    risk_verdict: tx.riskVerdict ?? null,
    risk_reasons: tx.riskReasons ?? null,
    in_review: tx.inReview ?? false,
    review_reason: tx.reviewReason ?? null,
    reviewed_at: tx.reviewedAt ?? null,
    rejected: tx.rejected ?? false,
    rejected_at: tx.rejectedAt ?? null,
    reject_reason: tx.rejectReason ?? null,
    rejection_status: tx.rejectionStatus ?? null,
    cancel_safe_tx_hash: tx.cancelSafeTxHash ?? null,
    cancel_tx_hash: tx.cancelTxHash ?? null,
    cancel_attempts: tx.cancelAttempts ?? 0,
    cancel_last_error: tx.cancelLastError ?? null,
    cancel_next_retry_at: tx.cancelNextRetryAt ?? null,
    amount_usd: tx.amountUSD ?? null,
    executed_at: tx.executedAt ?? null,
    executed_by: tx.executedBy ?? null,
    tx_hash: tx.txHash ?? null,
    success: tx.success ?? null,
    screening_disabled: tx.screeningDisabled ?? false,
    to_token_address: tx.toTokenAddress ?? null,
  };
}

function rowToRequest(row: RequestRow): QueuedRequest {
  return {
    id: row.id,
    type: row.request_type === "transfer" ? "transfer" : "invoice",
    kind: row.kind === "swap" ? "swap" : "transfer",
    safeAddress: row.safe_address ?? undefined,
    to: row.to_address ?? "",
    amount: row.amount ?? "",
    token: row.token ?? "",
    fromToken: row.from_token ?? undefined,
    toToken: row.to_token ?? undefined,
    slippage: row.slippage ?? undefined,
    description: row.description ?? undefined,
    invoiceNumber: row.invoice_number ?? undefined,
    issueDate: row.issue_date ?? undefined,
    dueDate: row.due_date ?? undefined,
    billedFrom: (row.billed_from as unknown as QueuedRequest["billedFrom"]) ?? undefined,
    billedTo: (row.billed_to as unknown as QueuedRequest["billedTo"]) ?? undefined,
    services: (row.services as QueuedRequest["services"]) ?? undefined,
    riskScore: row.risk_score ?? undefined,
    riskNotes: row.risk_notes ?? undefined,
    sourceChannel: row.source_channel ?? "",
    queuedAt: row.queued_at,
    status: row.status,
    txId: row.tx_id ?? undefined,
    executedAt: row.executed_at ?? undefined,
    txHash: row.tx_hash ?? undefined,
    rejectedAt: row.rejected_at ?? undefined,
    rejectReason: row.reject_reason ?? undefined,
  };
}

function requestToRow(req: QueuedRequest): RequestRow {
  return {
    id: req.id,
    request_type: req.type ?? "invoice",
    kind: req.kind ?? "transfer",
    safe_address: req.safeAddress?.toLowerCase() ?? null,
    to_address: req.to ?? null,
    amount: req.amount ?? null,
    token: req.token ?? null,
    from_token: req.fromToken ?? null,
    to_token: req.toToken ?? null,
    slippage: req.slippage ?? null,
    description: req.description ?? null,
    invoice_number: req.invoiceNumber ?? null,
    issue_date: req.issueDate ?? null,
    due_date: req.dueDate ?? null,
    billed_from: (req.billedFrom as unknown as Record<string, unknown>) ?? null,
    billed_to: (req.billedTo as unknown as Record<string, unknown>) ?? null,
    services: req.services ?? null,
    risk_score: req.riskScore ?? null,
    risk_notes: req.riskNotes ?? null,
    source_channel: req.sourceChannel ?? null,
    queued_at: req.queuedAt,
    status: req.status,
    tx_id: req.txId ?? null,
    executed_at: req.executedAt ?? null,
    tx_hash: req.txHash ?? null,
    rejected_at: req.rejectedAt ?? null,
    reject_reason: req.rejectReason ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
// Transactions
// ─────────────────────────────────────────────────────────────

export async function getTransaction(id: string): Promise<PendingTransaction | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .single<TransactionRow>();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data ? rowToTx(data) : null;
}

export async function createTransaction(tx: PendingTransaction): Promise<void> {
  const { error } = await supabase.from("transactions").insert(txToRow(tx));
  if (error) throw error;
}

export async function updateTransaction(
  id: string,
  patch: Partial<PendingTransaction>
): Promise<void> {
  const keyMap: Partial<Record<keyof PendingTransaction, keyof TransactionRow>> = {
    to: "to_address",
    amount: "amount",
    token: "token",
    direction: "direction",
    tokenAddress: "token_address",
    tokenIconUrl: "token_icon_url",
    proposedBy: "proposed_by",
    ownerAddresses: "owner_addresses",
    threshold: "threshold",
    safeAddress: "safe_address",
    txType: "tx_type",
    userOp: "user_op",
    partialSignatures: "partial_signatures",
    safeTxHash: "safe_tx_hash",
    safeTx: "safe_tx",
    safeNonce: "safe_nonce",
    userSignature: "user_signature",
    userSignatures: "user_signatures",
    rejectionSignature: "rejection_signature",
    proposedAt: "proposed_at",
    executedAt: "executed_at",
    executedBy: "executed_by",
    txHash: "tx_hash",
    success: "success",
    inReview: "in_review",
    reviewReason: "review_reason",
    reviewedAt: "reviewed_at",
    rejected: "rejected",
    rejectedAt: "rejected_at",
    rejectReason: "reject_reason",
    rejectionStatus: "rejection_status",
    cancelSafeTxHash: "cancel_safe_tx_hash",
    cancelTxHash: "cancel_tx_hash",
    cancelAttempts: "cancel_attempts",
    cancelLastError: "cancel_last_error",
    cancelNextRetryAt: "cancel_next_retry_at",
    riskScore: "risk_score",
    riskVerdict: "risk_verdict",
    riskReasons: "risk_reasons",
    screeningDisabled: "screening_disabled",
    amountUSD: "amount_usd",
    toTokenAddress: "to_token_address",
  };

  const row: Partial<TransactionRow> = {};
  for (const [appKey, val] of Object.entries(patch)) {
    const dbKey = keyMap[appKey as keyof PendingTransaction];
    if (dbKey) (row as Record<string, unknown>)[dbKey] = val;
  }

  const { error } = await supabase.from("transactions").update(row).eq("id", id);
  if (error) throw error;
}

export async function getTransactionsByAddress(
  safeAddress: string
): Promise<PendingTransaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .order("proposed_at", { ascending: false })
    .returns<TransactionRow[]>();

  if (error) throw error;
  return (data ?? []).map(rowToTx);
}

export async function getLastInReviewTransaction(
  safeAddress: string
): Promise<PendingTransaction | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .eq("in_review", true)
    .eq("rejected", false)
    .is("executed_at", null)
    .order("proposed_at", { ascending: false })
    .limit(1)
    .returns<TransactionRow[]>();

  if (error) throw error;
  return data && data.length > 0 ? rowToTx(data[0]) : null;
}

// ─────────────────────────────────────────────────────────────
// User settings
// ─────────────────────────────────────────────────────────────


export async function getTelegramChatId(safeAddress: string): Promise<string | undefined> {
  // Backend-owned read of the MIXED user_settings table (the E2 wrinkle):
  // telegram identity lives beside agent screening state until the split.
  // Deliberately a direct minimal query — the settings accessor is
  // agent-domain (agentData.ts) and the backend must not import it.
  const { data, error } = await supabase
    .from("user_settings")
    .select("telegram_chat_id")
    .eq("safe_address", safeAddress.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data?.telegram_chat_id ?? undefined;
}

/**
 * Marks bot_connected = true for whichever safe has the given telegram_chat_id.
 * Called by the Telegram webhook when any message arrives from a known user.
 * Returns true if a row was found and updated.
 */
export async function markBotConnectedByChatId(chatId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_settings")
    .update({ bot_connected: true })
    .eq("telegram_chat_id", chatId)
    .select("safe_address")
    .returns<{ safe_address: string }[]>();

  if (error) throw error;
  return (data ?? []).length > 0;
}


// ─────────────────────────────────────────────────────────────
// Global limits
// ─────────────────────────────────────────────────────────────


export async function getRequests(safeAddress: string): Promise<QueuedRequest[]> {
  const { data, error } = await supabase
    .from("requests")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .order("queued_at", { ascending: false })
    .returns<RequestRow[]>();

  if (error) throw error;
  return (data ?? []).map(rowToRequest);
}

export async function getRequest(id: string): Promise<QueuedRequest | null> {
  const { data, error } = await supabase
    .from("requests")
    .select("*")
    .eq("id", id)
    .single<RequestRow>();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data ? rowToRequest(data) : null;
}

export async function createRequest(request: QueuedRequest): Promise<void> {
  const { error } = await supabase.from("requests").insert(requestToRow(request));
  if (error) throw error;
}

export async function updateRequest(
  id: string,
  patch: Partial<QueuedRequest>
): Promise<QueuedRequest> {
  const rowPatch: Partial<RequestRow> = {};
  if (patch.status !== undefined)       rowPatch.status        = patch.status;
  if (patch.txId !== undefined)         rowPatch.tx_id         = patch.txId;
  if (patch.txHash !== undefined)       rowPatch.tx_hash       = patch.txHash;
  if (patch.executedAt !== undefined)   rowPatch.executed_at   = patch.executedAt;
  if (patch.rejectedAt !== undefined)   rowPatch.rejected_at   = patch.rejectedAt;
  if (patch.rejectReason !== undefined) rowPatch.reject_reason = patch.rejectReason;

  const { data, error } = await supabase
    .from("requests")
    .update(rowPatch)
    .eq("id", id)
    .select()
    .single<RequestRow>();

  if (error) throw error;
  return rowToRequest(data!);
}

/** The request linked to a given transaction id (auto-approve flow), if any. */
export async function getRequestByTxId(txId: string): Promise<QueuedRequest | null> {
  const { data, error } = await supabase
    .from("requests")
    .select("*")
    .eq("tx_id", txId)
    .limit(1)
    .returns<RequestRow[]>();
  if (error) throw error;
  return data && data[0] ? rowToRequest(data[0]) : null;
}

/**
 * Keep a request in sync with its linked transaction's lifecycle. This is what
 * makes request status authoritative (driven by the tx reconciliation) rather
 * than by client polling — so pre-signed / override / background executions all
 * land. No-op when the tx has no request (normal sends) or the request is
 * already terminal (never move it backwards). Best-effort — callers may
 * fire-and-forget.
 */
export async function syncLinkedRequest(
  txId: string,
  patch: Partial<QueuedRequest>
): Promise<void> {
  const req = await getRequestByTxId(txId);
  if (!req) return;
  if (req.status === "executed" || req.status === "rejected") return;
  await updateRequest(req.id, patch);
}

// ─────────────────────────────────────────────────────────────
// Pattern learning — called after a transaction outcome is known
// ─────────────────────────────────────────────────────────────


/**
 * Inserts a row into behavioral_events.
 * Call this on every transaction outcome (approve, block, review, reject).
 */
export async function getCampaign(id: string): Promise<CampaignRow | null> {
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

export async function getCampaigns(): Promise<CampaignRow[]> {
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getCampaignClaimCount(campaignId: string): Promise<number> {
  const { count } = await supabase
    .from("campaign_claims")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  return count ?? 0;
}

export async function getCampaignClaim(
  campaignId: string,
  safeAddress: string
): Promise<CampaignClaimRow | null> {
  const { data } = await supabase
    .from("campaign_claims")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("safe_address", safeAddress.toLowerCase())
    .maybeSingle();
  return data ?? null;
}

export async function createCampaignClaim(
  campaignId: string,
  safeAddress: string,
  tokenAmount: string
): Promise<CampaignClaimRow> {
  const { data, error } = await supabase
    .from("campaign_claims")
    .insert({
      campaign_id: campaignId,
      safe_address: safeAddress.toLowerCase(),
      token_amount: tokenAmount,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateCampaignClaim(
  campaignId: string,
  safeAddress: string,
  patch: Partial<Pick<CampaignClaimRow, "status" | "tx_hash" | "paid_at">>
): Promise<void> {
  await supabase
    .from("campaign_claims")
    .update(patch)
    .eq("campaign_id", campaignId)
    .eq("safe_address", safeAddress.toLowerCase());
}

// ─────────────────────────────────────────────────────────────
// User details
// ─────────────────────────────────────────────────────────────

export async function getUserByTelegramId(telegramId: string): Promise<UserDetailsRow | null> {
  const { data } = await supabase
    .from("user_details")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return data ?? null;
}

export async function getUserByUsername(username: string): Promise<UserDetailsRow | null> {
  const { data } = await supabase
    .from("user_details")
    .select("*")
    .eq("username", username.toLowerCase())
    .maybeSingle();
  return data ?? null;
}

export async function getUserDetails(safeAddress: string): Promise<UserDetailsRow | null> {
  const { data } = await supabase
    .from("user_details")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .maybeSingle();
  return data ?? null;
}

export async function getUserBySignerAddress(signerAddress: string): Promise<UserDetailsRow | null> {
  // Deterministic pick if a signer ever maps to multiple rows (e.g. an
  // orphaned row from an interrupted onboarding): prefer the completed
  // account, then the newest. `.maybeSingle()` without the limit ERRORS on
  // multiple matches — and a swallowed error here reads as "no record",
  // bouncing a returning user into onboarding.
  const { data } = await supabase
    .from("user_details")
    .select("*")
    .ilike("signer_address", signerAddress)
    .order("onboarding_completed", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/**
 * Looks up a user by any address they own — safe_address or signer_address.
 * Used to find a recipient when sending a Zhentan-to-Zhentan tx_received notification.
 */
export async function getUserByAddress(address: string): Promise<UserDetailsRow | null> {
  const addr = address.toLowerCase();
  const { data } = await supabase
    .from("user_details")
    .select("*")
    .or(`safe_address.eq.${addr},signer_address.ilike.${addr}`)
    .maybeSingle();
  return data ?? null;
}

/**
 * Writes the account's immutable birth certificate — the exact inputs that
 * derived safe_address. Write-once: no-ops when a snapshot already exists
 * (a DB trigger additionally rejects any mutation attempt).
 */
export async function setCreationSnapshot(
  safeAddress: string,
  snapshot: {
    owners: string[];
    threshold: number;
    saltNonce: string;
    derivationVersion: number;
  }
): Promise<void> {
  const { error } = await supabase
    .from("user_details")
    .update({
      creation_owners: snapshot.owners,
      creation_threshold: snapshot.threshold,
      creation_salt_nonce: snapshot.saltNonce,
      derivation_version: snapshot.derivationVersion,
    })
    .eq("safe_address", safeAddress.toLowerCase())
    .is("creation_owners", null);
  if (error) throw error;
}

export async function upsertUserDetails(
  safeAddress: string,
  patch: Partial<Omit<UserDetailsRow, "safe_address" | "created_at" | "updated_at">>
): Promise<void> {
  await supabase
    .from("user_details")
    .upsert(
      { safe_address: safeAddress.toLowerCase(), ...patch, updated_at: new Date().toISOString() },
      { onConflict: "safe_address" }
    );
}

/**
 * Increments daily_stats for a REJECT outcome.
 */
