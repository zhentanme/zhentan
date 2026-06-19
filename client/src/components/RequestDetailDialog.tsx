"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import type { QueuedRequest } from "@/types";
import { truncateAddress, formatDate } from "@/lib/format";
import { useApiClient } from "@/lib/api/client";
import { BSC_EXPLORER_URL } from "@/lib/constants";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { UsdcIcon } from "./icons/UsdcIcon";
import {
  FileText,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { clsx } from "clsx";
import { ThemeLoaderSpinner } from "./ThemeLoader";
import { ExecutedAnimation, ReviewAnimation, RejectedAnimation } from "./animations/StatusAnimation";

interface RequestDetailDialogProps {
  request: QueuedRequest | null;
  open: boolean;
  onClose: () => void;
  onApprove?: (request: QueuedRequest) => Promise<{ txId: string }>;
  onReject?: (request: QueuedRequest, reason: string) => Promise<void>;
  onRefresh?: () => void;
}

/** Active approval lifecycle once the user clicks "Approve & Send". */
type ScreeningPhase =
  | "idle"
  | "proposing"
  | "screening"
  | "review"
  | "executed"
  | "rejected"
  | "error";

function StatusAnimation({ status }: { status: QueuedRequest["status"] }) {
  const common = "rounded-2xl flex items-center justify-center";
  const size = "w-20 h-20";

  switch (status) {
    case "queued":
      return (
        <motion.div
          className={`${size} ${common} bg-watch/15 text-watch`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{
            scale: 1,
            opacity: 1,
            rotate: [0, 5, -5, 0],
          }}
          transition={{
            opacity: { duration: 0.3 },
            scale: { type: "spring", bounce: 0.4 },
            rotate: { repeat: Infinity, duration: 2, ease: "easeInOut" },
          }}
        >
          <Clock className="h-10 w-10" />
        </motion.div>
      );
    case "approved":
      return (
        <motion.div
          className={`${size} ${common} bg-gold/15 text-gold`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: [1, 1.05, 1], opacity: 1 }}
          transition={{
            opacity: { duration: 0.3 },
            scale: { repeat: Infinity, duration: 1.5, ease: "easeInOut" },
          }}
        >
          <Send className="h-10 w-10" />
        </motion.div>
      );
    case "executed":
      return (
        <motion.div
          className={`${size} ${common} bg-gold/20 text-gold`}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.2, 1], opacity: 1 }}
          transition={{
            duration: 0.5,
            scale: { times: [0, 0.6, 1], duration: 0.5 },
          }}
        >
          <CheckCircle2 className="h-10 w-10" />
        </motion.div>
      );
    case "rejected":
      return (
        <motion.div
          className={`${size} ${common} bg-danger/15 text-danger`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
          transition={{
            opacity: { duration: 0.3 },
            scale: { type: "spring", bounce: 0.3 },
            x: { duration: 0.4 },
          }}
        >
          <XCircle className="h-10 w-10" />
        </motion.div>
      );
  }
}

function RiskBadge({ score }: { score: number }) {
  const color =
    score < 40
      ? "bg-gold/15 text-gold"
      : score <= 70
        ? "bg-watch/15 text-watch"
        : "bg-danger/15 text-danger";
  const label = score < 40 ? "Low" : score <= 70 ? "Medium" : "High";

  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        color
      )}
    >
      {label} ({score})
    </span>
  );
}

const statusLabels: Record<QueuedRequest["status"], string> = {
  queued: "Queued for Review",
  approved: "Approved",
  executed: "Executed",
  rejected: "Rejected",
};

export function RequestDetailDialog({
  request,
  open,
  onClose,
  onApprove,
  onReject,
  onRefresh,
}: RequestDetailDialogProps) {
  const api = useApiClient();
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const [phase, setPhase] = useState<ScreeningPhase>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [resultReason, setResultReason] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  if (!request) return null;

  const isInvoice = request.type === "invoice";

  const resetScreening = () => {
    cancelledRef.current = true;
    setPhase("idle");
    setTxHash(null);
    setResultReason(null);
    setErrorMsg(null);
  };

  const handleClose = () => {
    resetScreening();
    setRejectReason("");
    setShowRejectInput(false);
    onClose();
  };

  // Poll the proposed transaction until it executes or is rejected. While the
  // agent has it in review the user approves from Telegram, so we keep polling.
  const pollScreening = async (txId: string) => {
    const maxAttempts = 40; // ~2 min at 3s
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));
      if (cancelledRef.current) return;

      let tx;
      try {
        tx = (await api.transactions.get(txId)).transaction;
      } catch {
        continue;
      }
      if (cancelledRef.current) return;

      if (tx.txHash) {
        setTxHash(tx.txHash);
        setPhase("executed");
        await api.requests
          .update({ id: request.id, status: "executed", txHash: tx.txHash })
          .catch(() => {});
        onRefresh?.();
        return;
      }
      if (tx.rejected) {
        const reason = tx.rejectReason || tx.reviewReason || "Blocked by screening";
        setResultReason(reason);
        setPhase("rejected");
        await api.requests
          .update({ id: request.id, status: "rejected", rejectReason: reason })
          .catch(() => {});
        onRefresh?.();
        return;
      }
      if (tx.inReview || tx.riskVerdict === "REVIEW") {
        setPhase("review");
      }
    }
    // Timed out — the agent still holds it for review. Leave request "approved".
    setPhase("review");
  };

  const handleApprove = async () => {
    if (!onApprove) return;
    cancelledRef.current = false;
    setErrorMsg(null);
    setPhase("proposing");
    try {
      const { txId } = await onApprove(request);
      if (cancelledRef.current) return;
      setPhase("screening");
      await pollScreening(txId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Approval failed");
      setPhase("error");
    }
  };

  const handleReject = async () => {
    if (!onReject) return;
    setRejecting(true);
    try {
      await onReject(request, rejectReason);
      setRejectReason("");
      setShowRejectInput(false);
      handleClose();
    } finally {
      setRejecting(false);
    }
  };

  // Active approval lifecycle takes over the dialog with clear status messaging.
  if (phase !== "idle") {
    return (
      <Dialog open={open} onClose={handleClose} title="Payment" className="max-w-md">
        <ScreeningView
          request={request}
          phase={phase}
          txHash={txHash}
          resultReason={resultReason}
          errorMsg={errorMsg}
          onDone={handleClose}
          onRetry={handleApprove}
        />
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={isInvoice ? "Invoice details" : "Payment request"}
      className="max-w-md"
    >
      <div className="space-y-6">
        {/* Status animation */}
        <div className="flex flex-col items-center gap-3">
          <StatusAnimation status={request.status} />
          <span
            className={clsx(
              "text-sm font-semibold",
              request.status === "executed" || request.status === "approved"
                ? "text-gold"
                : request.status === "rejected"
                  ? "text-danger"
                  : "text-watch"
            )}
          >
            {statusLabels[request.status]}
          </span>
        </div>

        {/* Amount row */}
        <div className="flex items-center gap-3 rounded-2xl bg-foreground/6 p-4">
          <div className="w-10 h-10 rounded-2xl bg-foreground/8 flex items-center justify-center text-gold">
            {isInvoice ? <FileText className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
          </div>
          <UsdcIcon size={24} className="shrink-0 opacity-90" />
          <span className="text-lg font-semibold text-foreground">
            {request.amount} {request.token}
          </span>
        </div>

        {/* Instruction from the agent (transfer requests) */}
        {request.description && (
          <div className="rounded-2xl bg-foreground/4 p-3">
            <p className="text-xs text-muted-foreground/80 mb-1">Instruction</p>
            <p className="text-sm text-foreground/80">{request.description}</p>
          </div>
        )}

        {/* Metadata */}
        <dl className="space-y-3 text-sm">
          {request.invoiceNumber && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground/80">Invoice #</dt>
              <dd className="text-foreground/80">{request.invoiceNumber}</dd>
            </div>
          )}
          {request.issueDate && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground/80">Issue Date</dt>
              <dd className="text-foreground/80">{request.issueDate}</dd>
            </div>
          )}
          {request.dueDate && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground/80">Due Date</dt>
              <dd className="text-foreground/80">{request.dueDate}</dd>
            </div>
          )}

          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground/80">Queued</dt>
            <dd className="text-foreground/80">{formatDate(request.queuedAt)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground/80">To</dt>
            <dd
              className="font-mono text-foreground truncate min-w-0 max-w-[50%] sm:max-w-[200px]"
              title={request.to}
            >
              {truncateAddress(request.to)}
            </dd>
          </div>
        </dl>

        {/* Services table (invoices) */}
        {isInvoice && request.services && request.services.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground/80 mb-2">Services</p>
            <div className="rounded-2xl bg-foreground/4 overflow-x-auto scrollbar-hide -mx-1">
              <table className="w-full text-sm min-w-[280px]">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground/80 border-b border-foreground/6">
                    <th className="px-2 sm:px-3 py-2 font-medium">Description</th>
                    <th className="px-2 sm:px-3 py-2 font-medium text-right whitespace-nowrap">Qty</th>
                    <th className="px-2 sm:px-3 py-2 font-medium text-right whitespace-nowrap">Rate</th>
                    <th className="px-2 sm:px-3 py-2 font-medium text-right whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {request.services.map((svc, i) => (
                    <tr
                      key={i}
                      className="border-b border-foreground/[0.04] last:border-0"
                    >
                      <td className="px-2 sm:px-3 py-2 text-foreground/80 min-w-0">
                        {svc.description}
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-muted-foreground text-right whitespace-nowrap">
                        {svc.qty}
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-muted-foreground text-right whitespace-nowrap">
                        {svc.rate}
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-foreground text-right whitespace-nowrap">
                        {svc.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Risk assessment */}
        {request.riskScore != null && (
          <div className="rounded-2xl bg-foreground/4 p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground/80">Risk Assessment</p>
              <RiskBadge score={request.riskScore} />
            </div>
            {request.riskNotes && (
              <p className="text-xs text-muted-foreground">{request.riskNotes}</p>
            )}
          </div>
        )}

        {/* Rejection info */}
        {request.status === "rejected" && request.rejectReason && (
          <div className="rounded-2xl bg-danger/10 p-3">
            <p className="text-xs text-danger/70 mb-1">Rejection Reason</p>
            <p className="text-sm text-danger">{request.rejectReason}</p>
          </div>
        )}

        {/* Action buttons (only for queued requests) */}
        {request.status === "queued" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-2xl bg-gold/8 px-3 py-2.5 text-xs text-foreground/80">
              <ShieldCheck className="h-4 w-4 text-gold shrink-0" />
              <span>
                Zhentan screens this payment before it&rsquo;s sent. You may need
                to confirm in Telegram.
              </span>
            </div>
            <Button
              onClick={handleApprove}
              disabled={rejecting}
              className="w-full py-3.5"
            >
              Approve &amp; Send
            </Button>

            {showRejectInput ? (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Reason (optional)"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full rounded-2xl bg-foreground/6 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-danger/40 transition-all"
                />
                <Button
                  variant="secondary"
                  onClick={handleReject}
                  loading={rejecting}
                  className="w-full py-3 text-danger hover:text-danger"
                >
                  Confirm Reject
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                onClick={() => setShowRejectInput(true)}
                className="w-full py-3 text-danger hover:text-danger"
              >
                Reject
              </Button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** Renders the active approval lifecycle with clear, phase-specific messaging. */
function ScreeningView({
  request,
  phase,
  txHash,
  resultReason,
  errorMsg,
  onDone,
  onRetry,
}: {
  request: QueuedRequest;
  phase: Exclude<ScreeningPhase, "idle">;
  txHash: string | null;
  resultReason: string | null;
  errorMsg: string | null;
  onDone: () => void;
  onRetry: () => void;
}) {
  const explorerUrl = txHash ? `${BSC_EXPLORER_URL}/tx/${txHash}` : null;

  const copy: Record<
    Exclude<ScreeningPhase, "idle">,
    { title: string; subtitle: string }
  > = {
    proposing: {
      title: "Proposing payment",
      subtitle: "Awaiting your signature",
    },
    screening: {
      title: "Screening payment",
      subtitle: "Zhentan is analyzing this transaction",
    },
    review: {
      title: "Pending review",
      subtitle: "Approve in your Telegram chat to release the payment",
    },
    executed: { title: "Payment sent", subtitle: "Executed on BNB Chain" },
    rejected: { title: "Payment blocked", subtitle: "Screening rejected this payment" },
    error: { title: "Couldn’t propose payment", subtitle: "Please try again" },
  };

  const isLoading = phase === "proposing" || phase === "screening";
  const { title, subtitle } = copy[phase];

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {isLoading ? (
          <ThemeLoaderSpinner variant="transaction" />
        ) : phase === "review" ? (
          <ReviewAnimation size={80} />
        ) : phase === "executed" ? (
          <ExecutedAnimation size={80} />
        ) : (
          <RejectedAnimation size={80} />
        )}
        <div>
          <p
            className={clsx(
              "text-sm font-semibold",
              phase === "executed"
                ? "text-gold"
                : phase === "rejected" || phase === "error"
                  ? "text-danger"
                  : phase === "review"
                    ? "text-watch"
                    : "text-gold"
            )}
          >
            {title}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/80">{subtitle}</p>
        </div>
      </div>

      {/* Amount */}
      <div className="flex items-center gap-3 rounded-2xl bg-foreground/6 p-4">
        <div className="w-10 h-10 rounded-2xl bg-foreground/8 flex items-center justify-center text-gold">
          <Send className="h-5 w-5" />
        </div>
        <UsdcIcon size={24} className="shrink-0 opacity-90" />
        <span className="text-lg font-semibold text-foreground">
          {request.amount} {request.token}
        </span>
      </div>

      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground/80">To</dt>
          <dd
            className="font-mono text-foreground truncate min-w-0 max-w-[50%] sm:max-w-[200px]"
            title={request.to}
          >
            {truncateAddress(request.to)}
          </dd>
        </div>
      </dl>

      {phase === "rejected" && resultReason && (
        <div className="rounded-2xl bg-danger/10 p-3">
          <p className="text-xs text-danger/70 mb-1">Reason</p>
          <p className="text-sm text-danger">{resultReason}</p>
        </div>
      )}

      {phase === "error" && errorMsg && (
        <div className="rounded-2xl bg-danger/10 p-3">
          <p className="text-sm text-danger">{errorMsg}</p>
        </div>
      )}

      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-xs text-gold hover:text-gold/80"
        >
          View on BscScan <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {phase === "error" ? (
        <div className="space-y-2">
          <Button onClick={onRetry} className="w-full py-3.5">
            Try again
          </Button>
          <Button
            variant="ghost"
            onClick={onDone}
            className="w-full py-3 text-muted-foreground hover:text-foreground"
          >
            Close
          </Button>
        </div>
      ) : isLoading ? (
        <Button
          variant="ghost"
          onClick={onDone}
          className="w-full py-3 text-muted-foreground hover:text-foreground"
        >
          Close
        </Button>
      ) : (
        <Button onClick={onDone} className="w-full py-3.5">
          Done
        </Button>
      )}
    </div>
  );
}
