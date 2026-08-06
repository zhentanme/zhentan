import type { TransactionStatus, PendingTransaction } from "../types.js";
import { isRejectionActive } from "./safe/rejectionState.js";

export function getTransactionStatus(tx: PendingTransaction): TransactionStatus {
  if (tx.rejected) return "rejected";
  if (tx.executedAt) return "executed";
  // Rejection accepted but the on-chain cancel hasn't confirmed yet (B4):
  // honest about the in-flight state instead of claiming "rejected".
  if (isRejectionActive(tx.rejectionStatus)) return "rejecting";
  if (tx.inReview) return "in_review";
  return "pending";
}
