export type TransactionDirection = "send" | "receive";

/**
 * How a transaction is signed and executed:
 * - "4337"   — ERC-4337 userOp via the Safe4337Module + Pimlico (gasless).
 * - "safetx" — standard SafeTx (EIP-712) proposed to the Safe Transaction
 *              Service; visible in app.safe.global; agent confirms and
 *              relays execTransaction.
 */
export type TxExecutionType = "4337" | "safetx";

/**
 * Standard Safe transaction fields (EIP-712 SafeTx message).
 * All uint fields are decimal strings for lossless JSON transport.
 * Must stay in sync with server/src/types.ts.
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

export interface DappMetadata {
  name: string;
  url: string;
  icons?: string[];
  description?: string;
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
  /** Zerion operation type: send | receive | trade | approve | execute | deposit | withdraw | … */
  operationType?: string;
  /** For trade operations: the token received in exchange */
  tradeReceived?: { symbol: string; amount: string; iconUrl: string };
  /** USD value of the primary transfer (from Zerion) */
  valueUSD?: number;
  /** USD value at proposal time — used for cross-token pattern aggregations */
  amountUSD?: string;
  to: string;
  amount: string;
  token: string;
  /** If set, used in activity to show send vs receive. Defaults to "send" for proposed outbound transfers. */
  direction?: TransactionDirection;
  /** ERC20 token contract address (used for execution and display). */
  tokenAddress: string;
  /** Token icon URL for display in activity (e.g. from Zerion). Stored when proposing. */
  tokenIconUrl?: string | null;
  /** When true, server skips risk analysis; client triggers execute. */
  screeningDisabled?: boolean;
  proposedBy: string;
  signatures: string[];
  ownerAddresses: string[];
  threshold: number;
  safeAddress: string;
  /** Defaults to "4337" for legacy rows without the discriminator. */
  txType?: TxExecutionType;
  /**
   * Non-transfer rows, computed server-side at read time: "creation" is the
   * Safe deployment itself, "config" is owner/config management (the
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
  proposedAt: string;
  /** Transaction origin: "send_panel" for manual sends, "walletconnect" for DApp requests */
  // source?: "send_panel" | "walletconnect";
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
  /** Executing on-chain; awaiting Transaction Service reconciliation. */
  | "confirming"
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
  telegramChatId?: string | null;
  botConnected?: boolean;
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
  /** 24h absolute USD change of this position's value (null if unavailable). */
  priceChange1d?: number | null;
  /** 24h percent change of this position (null if unavailable). */
  pricePercentChange1d?: number | null;
  address: string | null;
  /** True for zero-balance fallback entries shown when the portfolio is sparse. */
  placeholder?: boolean;
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

/**
 * Safe identity a proposal needs — sourced from AuthContext
 * (`safeAddress` + `safeConfig`).
 */
export interface SafeProposalContext {
  safeAddress: string;
  owners: string[];
  threshold: number;
  /**
   * Derivation version (1 = legacy 4337, 2 = vanilla). Legacy v1 wallets keep
   * the agent as co-signer when screening is off (no backup key required);
   * v2+ wallets must co-sign with the backup key to reach the threshold.
   */
  derivationVersion?: number | null;
}

export interface ProposeParams {
  recipient: string;
  amount: string;
  /** Safe identity + execution mode (from useAuth().safeConfig). */
  safe: SafeProposalContext;
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
  /**
   * Take the current executable nonce so this tx skips a stuck proposal
   * (replacing whatever is pending at that nonce). Screening still applies —
   * only the queue position changes.
   */
  forceExecute?: boolean;
  /** USD value at proposal time — for cross-token pattern aggregations */
  amountUSD?: string;
  /** Privy identity token for authenticating the backend request */
  identityToken?: string | null;
}

// Request types (invoices & general transfer instructions from the agent)

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

export type RequestStatus = "queued" | "approved" | "executed" | "rejected";

/** 'invoice' = parsed invoice document; 'transfer' = general transaction instruction */
export type RequestType = "invoice" | "transfer";

/**
 * An incoming payment request routed through the agent — either a parsed
 * invoice or a general transfer instruction. Invoice-specific fields are
 * undefined for non-invoice requests.
 */
export interface QueuedRequest {
  id: string;
  type: RequestType;
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
