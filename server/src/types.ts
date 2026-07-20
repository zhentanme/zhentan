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
  proposedAt: string;
  executedAt?: string;
  executedBy?: string;
  txHash?: string;
  success?: boolean;
  inReview?: boolean;
  reviewReason?: string;
  reviewedAt?: string;
  rejected?: boolean;
  rejectedAt?: string;
  rejectReason?: string;
  riskScore?: number;
  riskVerdict?: "APPROVE" | "REVIEW" | "BLOCK";
  riskReasons?: string[];
  screeningDisabled?: boolean;
}

export type TransactionStatus =
  | "pending"
  | "in_review"
  /** Executing on-chain; awaiting Transaction Service reconciliation (transient, read-time only). */
  | "confirming"
  | "executed"
  | "rejected";

export interface TransactionWithStatus extends PendingTransaction {
  status: TransactionStatus;
}

export interface QueueFile {
  pending: PendingTransaction[];
}

export type RequestStatus = "queued" | "approved" | "executed" | "rejected";

/** 'invoice' = parsed invoice document; 'transfer' = general transaction instruction */
export type RequestType = "invoice" | "transfer";

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
  /** Owner Safe address — requests are scoped per-Safe. */
  safeAddress?: string;
  to: string;
  amount: string;
  token: string;
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
