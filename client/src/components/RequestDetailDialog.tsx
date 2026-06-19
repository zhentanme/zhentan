"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
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
  Send,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
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

/** Polished status visuals shared with the activity (transaction) dialog. */
function StatusAnimation({ status }: { status: QueuedRequest["status"] }) {
  switch (status) {
    case "queued":
    case "approved":
      return <ReviewAnimation size={80} />;
    case "executed":
      return <ExecutedAnimation size={80} />;
    case "rejected":
      return <RejectedAnimation size={80} />;
  }
}

/** Severity bucket → tailwind text/bg classes (mirrors TransactionDetailDialog). */
function severity(score: number): { tone: "safe" | "watch" | "danger"; text: string; bg: string; label: string } {
  if (score >= 70) return { tone: "danger", text: "text-danger", bg: "bg-danger", label: "High" };
  if (score >= 40) return { tone: "watch", text: "text-watch", bg: "bg-watch", label: "Medium" };
  return { tone: "safe", text: "text-safe", bg: "bg-safe", label: "Low" };
}

/**
 * Expandable "View analysis" panel — same treatment as the activity dialog,
 * adapted to request fields (riskScore + free-text riskNotes, plus the
 * rejection reason for blocked requests).
 */
function RequestAnalysisSection({
  riskScore,
  riskNotes,
  rejectReason,
}: {
  riskScore?: number;
  riskNotes?: string;
  rejectReason?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = riskScore != null ? severity(riskScore) : null;

  return (
    <div className="rounded-2xl bg-foreground/6 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-foreground/6 transition-colors cursor-pointer"
      >
        <ShieldAlert className="h-4 w-4 text-watch/90 shrink-0" />
        <span className="text-sm font-medium text-foreground flex-1">View analysis</span>
        {sev && (
          <span className={`font-mono text-xs font-semibold ${sev.text}`}>
            {riskScore}
            <span className="text-muted-foreground/60">/100</span>
          </span>
        )}
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground/80 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground/80 shrink-0" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-foreground/10"
          >
            <div className="px-4 py-3.5 space-y-3.5 text-sm">
              {/* Risk score + bar */}
              {riskScore != null && sev && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-muted-foreground/80">Risk score</span>
                    <span className={`font-mono font-semibold ${sev.text}`}>
                      {riskScore}
                      <span className="text-muted-foreground/60">/100</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-pill bg-foreground/10 overflow-hidden">
                    <motion.span
                      className={`block h-full rounded-pill ${sev.bg}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.max(0, riskScore))}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                </div>
              )}

              {/* Verdict / level */}
              {sev && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground/80">Verdict</span>
                  <span className={`font-mono uppercase tracking-wide text-xs font-semibold ${sev.text}`}>
                    {sev.label}
                  </span>
                </div>
              )}

              {/* Agent notes */}
              {riskNotes && (
                <div>
                  <span className="text-muted-foreground/80 block mb-1">Message</span>
                  <p className="text-foreground/85 leading-relaxed">{riskNotes}</p>
                </div>
              )}

              {/* Rejection reason */}
              {rejectReason && (
                <div>
                  <span className="text-muted-foreground/80 block mb-1">Rejection reason</span>
                  <p className="text-danger leading-relaxed">{rejectReason}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
        {/* Status animation — morphs in place when the status changes */}
        <AnimatePresence mode="wait">
          <motion.div
            key={request.status}
            className="flex flex-col items-center gap-3"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
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
          </motion.div>
        </AnimatePresence>

        {/* Hero amount — op icon + token avatar + amount (mirrors activity dialog) */}
        <div className="rounded-2xl bg-foreground/6 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-foreground/[0.08] flex items-center justify-center shrink-0 text-gold">
            {isInvoice ? <FileText className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
          </div>
          <div className="w-9 h-9 rounded-full bg-foreground/8 flex items-center justify-center shrink-0 overflow-hidden">
            <UsdcIcon size={22} className="opacity-90" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-foreground">
              {request.amount} {request.token}
            </p>
          </div>
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
          {request.executedAt && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground/80">Executed</dt>
              <dd className="text-foreground/80 truncate min-w-0">{formatDate(request.executedAt)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2 sm:gap-4">
            <dt className="text-muted-foreground/80 shrink-0">{isInvoice ? "Pay to" : "To"}</dt>
            <dd className="min-w-0 max-w-[50%] sm:max-w-[200px] truncate" title={request.to}>
              <a
                href={`${BSC_EXPLORER_URL}/address/${request.to}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 font-mono text-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline truncate"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80 group-hover:text-foreground" />
                <span className="truncate">{truncateAddress(request.to, 10)}</span>
              </a>
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

        {/* Agent analysis — expandable: score, verdict, notes, rejection reason */}
        {(request.riskScore != null ||
          request.riskNotes ||
          (request.status === "rejected" && request.rejectReason)) && (
          <RequestAnalysisSection
            riskScore={request.riskScore}
            riskNotes={request.riskNotes}
            rejectReason={request.status === "rejected" ? request.rejectReason : undefined}
          />
        )}

        {/* BSCScan explorer link — executed requests */}
        {request.txHash && (
          <motion.a
            href={`${BSC_EXPLORER_URL}/tx/${request.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-2xl py-3 bg-foreground/8 text-foreground/80 hover:text-foreground hover:bg-foreground/12 transition-colors text-sm font-medium"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="relative w-[18px] h-[18px] shrink-0">
              <Image src="/bscscan.png" alt="" fill className="object-contain rounded" sizes="18px" />
            </span>
            View on BSC Explorer
            <ExternalLink className="h-3.5 w-3.5 opacity-50" />
          </motion.a>
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
