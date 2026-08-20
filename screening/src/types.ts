export type TransactionDirection = "send" | "receive";

/**
 * How a transaction is signed and executed:
 * - "4337"   — ERC-4337 userOp via the Safe4337Module + Pimlico (gasless).
 * - "safetx" — standard SafeTx (EIP-712) proposed to the Safe Transaction
 *              Service; visible in app.safe.global; agent confirms and
 *              relays execTransaction (agent EOA pays gas).
 */
export type TxExecutionType = "4337" | "safetx";

/**
 * Standard Safe transaction fields (EIP-712 SafeTx message).
 * All uint fields are decimal strings for lossless JSON transport.
 */
export interface SafeTxData {
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

export interface PendingTransaction {
  id: string;
  /**
   * Data availability for this activity item:
   * - "zhentan-only": in our DB but not yet on-chain (pending/in_review/rejected) or Zerion unavailable
   * - "zerion-only":  on-chain transaction we didn't initiate (external receives, etc.)
   * - "both":         executed via Zhentan and confirmed on-chain — has full risk data + Zerion op details
   */
  source?: "zhentan-only" | "zerion-only" | "both";
  /** Zerion operation type for on-chain items: send | receive | trade | approve | execute | deposit | withdraw | … */
  operationType?: string;
  /** Populated for trade operations: the token received in exchange */
  tradeReceived?: { symbol: string; amount: string; iconUrl: string };
  /** USD value of the primary transfer (from Zerion) */
  valueUSD?: number;
  /** USD value at proposal time — used for cross-token pattern aggregations */
  amountUSD?: string;
  to: string;
  amount: string;
  token: string;
  direction?: TransactionDirection;
  tokenAddress: string;
  /** Token icon URL for display (stored when proposing). */
  tokenIconUrl?: string | null;
  proposedBy: string;
  signatures: string[];
  ownerAddresses: string[];
  threshold: number;
  safeAddress: string;
  /** Defaults to "4337" for legacy rows without the discriminator. */
  txType?: TxExecutionType;
  /**
   * Non-transfer rows, computed at read time (never stored): "creation" is
   * the Safe deployment itself, "config" is owner/config management (the
   * wallet-profile transitions). Absent for ordinary transfers.
   */
  txKind?: "config" | "creation";
  /** Display label for txKind rows, e.g. "Backup key added". */
  kindLabel?: string;
  /** 4337 flow only. */
  userOp?: Record<string, unknown>;
  /** 4337 flow only. */
  partialSignatures?: string;
  /** SafeTx flow only. */
  safeTxHash?: string;
  safeTx?: SafeTxData;
  safeNonce?: number;
  /** User's EIP-712 signature over safeTxHash. */
  userSignature?: string;
  /**
   * Additional user co-signatures over safeTxHash (e.g. the backup key when
   * screening is off). When user signatures alone meet the threshold, the
   * agent relays without signing.
   */
  userSignatures?: { signer: string; data: string }[];
  /** Pre-signed empty tx at the same nonce, used to cancel on reject. */
  rejectionSignature?: string;
  /**
   * Agent-proposed row awaiting the user's decision. Drafts carry a safeTx
   * with a placeholder nonce and NO safeTxHash — the nonce is assigned and
   * the hash computed only when the user finalizes to sign, so dismissing a
   * draft never parks a Safe nonce.
   */
  draft?: boolean;
  /** Swap rows: the token being bought (the actual risk surface for analysis). */
  toTokenAddress?: string;
  proposedAt: string;
  executedAt?: string;
  executedBy?: string;
  txHash?: string;
  success?: boolean;
  inReview?: boolean;
  reviewReason?: string;
  reviewedAt?: string;
  /** Confirmed-rejected ONLY (`rejection_status = rejected_confirmed`, or a
   * reconciled supersession). In-flight cancels live in `rejectionStatus`. */
  rejected?: boolean;
  rejectedAt?: string;
  rejectReason?: string;
  /** Durable on-chain rejection lifecycle (B4); see lib/safe/rejectionState.ts. */
  rejectionStatus?: RejectionStatus;
  cancelSafeTxHash?: string;
  cancelTxHash?: string;
  cancelAttempts?: number;
  cancelLastError?: string;
  cancelNextRetryAt?: string | null;
  riskScore?: number;
  riskVerdict?: "APPROVE" | "REVIEW" | "BLOCK";
  riskReasons?: string[];
  screeningDisabled?: boolean;
}

export type RejectionStatus =
  | "requested"
  | "cancel_signing"
  | "cancel_submitted"
  | "rejected_confirmed"
  | "failed_retryable"
  | "superseded";

export type TransactionStatus =
  | "pending"
  | "in_review"
  /** Executing on-chain; awaiting Transaction Service reconciliation (transient, read-time only). */
  | "confirming"
  /** Rejection accepted; on-chain cancel not yet confirmed (B4 lifecycle). */
  | "rejecting"
  | "executed"
  | "rejected";

export interface TransactionWithStatus extends PendingTransaction {
  status: TransactionStatus;
}

export type RequestStatus = "queued" | "approved" | "executed" | "rejected";

/** 'invoice' = parsed invoice document; 'transfer' = general transaction instruction */
export type RequestType = "invoice" | "transfer";

/**
 * How a request SETTLES on-chain, orthogonal to `type` (which is
 * presentation: an invoice is a transfer with billing metadata). Defaults to
 * "transfer"; invoices are always transfers.
 */
export type RequestKind = "transfer" | "swap";

export interface InvoiceService {
  description: string;
  qty: number;
  rate: string;
  total: string;
}

export interface InvoiceParty {
  name: string;
  email?: string;
  address?: string;
}

/**
 * An incoming payment request routed through the agent — either a parsed
 * invoice or a general transfer instruction. Invoice-specific fields are
 * undefined for non-invoice requests.
 */
export interface QueuedRequest {
  id: string;
  type: RequestType;
  /** Settlement kind — absent means "transfer" (all pre-kind rows). */
  kind?: RequestKind;
  /** Owner Safe address — requests are scoped per-Safe. */
  safeAddress?: string;
  to: string;
  amount: string;
  token: string;
  /** Swap requests: sell-token symbol. */
  fromToken?: string;
  /** Swap requests: buy-token symbol. */
  toToken?: string;
  /** Swap requests: slippage as a fraction (0.005 = 0.5%). */
  slippage?: number;
  /** Free-text instruction/summary from the agent (e.g. the user's original ask). */
  description?: string;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  billedFrom?: InvoiceParty;
  billedTo?: InvoiceParty;
  services?: InvoiceService[];
  riskScore?: number;
  riskNotes?: string;
  sourceChannel: string;
  queuedAt: string;
  status: RequestStatus;
  txId?: string;
  executedAt?: string;
  txHash?: string;
  rejectedAt?: string;
  rejectReason?: string;
}
