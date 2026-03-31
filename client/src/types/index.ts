export type TransactionDirection = "send" | "receive";

export interface DappMetadata {
  name: string;
  url: string;
  icons?: string[];
  description?: string;
}

export interface PendingTransaction {
  id: string;
  to: string;
  amount: string;
  token: string;
  /** If set, used in activity to show send vs receive. Defaults to "send" for proposed outbound transfers. */
  direction?: TransactionDirection;
  /** ERC20 token contract address (used for execution and display). */
  usdcAddress: string;
  /** Token icon URL for display in activity (e.g. from Zerion). Stored when proposing. */
  tokenIconUrl?: string | null;
  /** When true, server skips risk analysis; client triggers execute. */
  screeningDisabled?: boolean;
  proposedBy: string;
  signatures: string[];
  ownerAddresses: string[];
  threshold: number;
  safeAddress: string;
  userOp: Record<string, unknown>;
  partialSignatures: string;
  proposedAt: string;
  /** Transaction origin: "send_panel" for manual sends, "walletconnect" for DApp requests */
  source?: "send_panel" | "walletconnect";
  /** Raw hex calldata from DApp (for WalletConnect transactions) */
  calldata?: string;
  /** Native value in wei as string (for WalletConnect transactions) */
  value?: string;
  /** DApp metadata from WalletConnect session */
  dappMetadata?: DappMetadata;
  // Execution
  executedAt?: string;
  executedBy?: string;
  txHash?: string;
  success?: boolean;
  // Review
  inReview?: boolean;
  reviewReason?: string;
  reviewedAt?: string;
  // Risk (from server screening)
  riskScore?: number;
  riskVerdict?: "APPROVE" | "REVIEW" | "BLOCK";
  riskReasons?: string[];
  // Rejection
  rejected?: boolean;
  rejectedAt?: string;
  rejectReason?: string;
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

export interface StateFile {
  screeningMode: boolean;
  lastCheck: string | null;
  decisions: unknown[];
}

export interface RecipientPattern {
  label: string | null;
  totalTxCount: number;
  totalVolume: string;
  avgAmount: string;
  maxAmount: string;
  lastSeen: string;
  typicalHours: (number | null)[];
  category: string;
}

export interface PatternsFile {
  recipients: Record<string, RecipientPattern>;
  dailyStats: Record<string, { txCount: number; totalVolume: string }>;
  globalLimits: {
    maxSingleTx: string;
    maxDailyVolume: string;
    allowedHoursUTC: number[];
  };
}

export interface StatusResponse {
  screeningMode: boolean;
  lastCheck: string | null;
  totalDecisions: number;
  patterns: PatternsFile;
}

export interface BalanceResponse {
  balance: string;
  formatted: string;
  safeAddress: string;
}

export interface TokenPosition {
  id: string;
  tokenId?: string;
  name: string;
  symbol: string;
  decimals: number;
  iconUrl?: string;
  usdValue: number | null;
  balance: string;
  price: number;
  address: string | null;
  chain: { id: string; chainId: number; name: string };
  verified: boolean;
}

export type ChartPeriod = "day" | "week" | "month" | "year" | "max";

export interface TokenChartPoint {
  timestamp: number;
  price: number;
}

export interface TokenChartData {
  beginAt: string;
  endAt: string;
  stats: { first: number; min: number; avg: number; max: number; last: number };
  points: TokenChartPoint[];
}

export interface TokenDetails {
  tokenId: string;
  name: string;
  symbol: string;
  description: string | null;
  iconUrl: string | null;
  verified: boolean;
  externalLinks: { type: string; name: string; url: string }[];
  marketData?: {
    totalSupply: number | null;
    circulatingSupply: number | null;
    marketCap: number | null;
    fullyDilutedValuation: number | null;
    price: number | null;
    changes: {
      percent1d: number | null;
      percent30d: number | null;
      percent90d: number | null;
      percent365d: number | null;
    };
  };
}

export interface PortfolioResponse {
  tokens: TokenPosition[];
  totalUsd: number;
  /** 24h portfolio % change, null if unavailable */
  percentChange24h?: number | null;
}

export interface ProposeParams {
  recipient: string;
  amount: string;
  ownerAddress: string;
  getOwnerAccount: () => Promise<import("viem").LocalAccount | null>;
  /** ERC20 token contract address (default: USDC from env) */
  tokenAddress?: string;
  /** Token decimals (default: USDC decimals) */
  tokenDecimals?: number;
  /** Token symbol for display (e.g. "USDC") */
  tokenSymbol?: string;
  /** Token icon URL for display in activity (e.g. from Zerion) */
  tokenIconUrl?: string | null;
  /** When true, server skips risk analysis and auto-execute; client will call execute. */
  screeningDisabled?: boolean;
  /** Privy identity token for authenticating the backend request */
  identityToken?: string | null;
}

// Invoice types

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

export type InvoiceStatus = "queued" | "approved" | "executed" | "rejected";

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
