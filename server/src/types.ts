export type TransactionDirection = "send" | "receive";

export interface PendingTransaction {
  id: string;
  to: string;
  amount: string;
  token: string;
  direction?: TransactionDirection;
  usdcAddress: string;
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
