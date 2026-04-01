export type TransactionDirection = "send" | "receive";

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
  userOp: Record<string, unknown>;
  partialSignatures: string;
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
  | "executed"
  | "rejected";

export interface TransactionWithStatus extends PendingTransaction {
  status: TransactionStatus;
}

export interface QueueFile {
  pending: PendingTransaction[];
}

export type InvoiceStatus = "queued" | "approved" | "executed" | "rejected";

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

export interface QueuedInvoice {
  id: string;
  to: string;
  amount: string;
  token: string;
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
  status: InvoiceStatus;
  txId?: string;
  executedAt?: string;
  txHash?: string;
  rejectedAt?: string;
  rejectReason?: string;
}

export interface InvoiceQueueFile {
  invoices: QueuedInvoice[];
}
