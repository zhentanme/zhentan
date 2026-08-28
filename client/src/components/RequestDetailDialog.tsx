"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import type { QueuedRequest } from "@/types";
import { truncateAddress, formatDate, formatTokenAmount } from "@/lib/format";
import { useApiClient } from "@/lib/api/client";
import { BSC_EXPLORER_URL } from "@/lib/constants";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { LINK_BUTTON_NEUTRAL } from "./txPresentation";
import { RiskSection } from "./RiskSection";
import { TokenGlyph } from "./TokenGlyph";
import {
  FileText,
  ArrowUpRight,
  Repeat2,
  Send,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { clsx } from "clsx";
import { ThemeLoaderSpinner } from "./ThemeLoader";
import { ExecutedAnimation, RejectedAnimation } from "./animations/StatusAnimation";
import { MaoAvatar } from "./MaoAvatar";

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
      // The agent prepared this and is waiting on YOUR call.
      return <MaoAvatar state="asking" size={80} />;
    case "approved":
      return <MaoAvatar state="scanning" size={80} />;
    case "executed":
      return <ExecutedAnimation size={80} />;
    case "rejected":
      return <RejectedAnimation size={80} />;
  }
}

const statusLabels: Record<QueuedRequest["status"], string> = {
  queued: "Queued for review",
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
  const isSwap = request.kind === "swap";

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
      title={isSwap ? "Swap request" : isInvoice ? "Invoice details" : "Payment request"}
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

        {/* Hero amount — mirrors the activity dialog: swaps get the dual-token
            trade layout, everything else the op icon + token + amount row. */}
        {isSwap && request.fromToken && request.toToken ? (
          <div className="rounded-md bg-foreground/6 p-4">
            <div className="flex items-center gap-1.5 mb-3 text-muted-foreground">
              <Repeat2 className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Swap</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <TokenGlyph symbol={request.fromToken} iconUrl={request.tokenIconUrl} size={36} />
                <p className="text-sm font-semibold text-foreground truncate">
                  -{formatTokenAmount(request.amount)} {request.fromToken.toUpperCase()}
                </p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground/80 shrink-0 rotate-45" />
              <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                <p className="text-sm font-semibold text-safe truncate">
                  {request.toToken.toUpperCase()}
                </p>
                <TokenGlyph symbol={request.toToken} iconUrl={request.toTokenIconUrl} size={36} />
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-md bg-foreground/6 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-foreground/[0.08] flex items-center justify-center shrink-0 text-gold">
              {isInvoice ? <FileText className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
            </div>
            <TokenGlyph symbol={request.token} iconUrl={request.tokenIconUrl} size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-foreground">
                {formatTokenAmount(request.amount)} {request.token}
              </p>
            </div>
          </div>
        )}

        {/* Instruction from the agent (transfer requests) */}
        {request.description && (
          <div className="rounded-md bg-foreground/4 p-3">
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
              <dt className="text-muted-foreground/80">Issued</dt>
              <dd className="text-foreground/80">{request.issueDate}</dd>
            </div>
          )}
          {request.dueDate && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground/80">Due</dt>
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
          {isSwap && request.slippage != null && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground/80">Max slippage</dt>
              <dd className="text-foreground/80">{(request.slippage * 100).toFixed(2).replace(/\.?0+$/, "")}%</dd>
            </div>
          )}
          {/* Counterparty — hidden for draft-less swaps (no recipient exists);
              a drafted swap's target is the DEX router, labeled as such. */}
          {request.to && (
            <div className="flex justify-between gap-2 sm:gap-4">
              <dt className="text-muted-foreground/80 shrink-0">
                {isSwap ? "Router" : isInvoice ? "Pay to" : "To"}
              </dt>
              <dd className="min-w-0 max-w-[50%] sm:max-w-[200px] truncate" title={request.to}>
                <a
                  href={`${BSC_EXPLORER_URL}/address/${request.to}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 font-mono text-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline truncate"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80 group-hover:text-foreground" />
                  <span className="truncate">{truncateAddress(request.to)}</span>
                </a>
              </dd>
            </div>
          )}
        </dl>

        {/* Services table (invoices) */}
        {isInvoice && request.services && request.services.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground/80 mb-2">Services</p>
            <div className="rounded-md bg-foreground/4 overflow-x-auto scrollbar-hide -mx-1">
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

        {/* Agent analysis — same shared panel as the activity dialog (#142):
            structured verdict + signals when present; legacy rows fall back
            to the flattened riskNotes as the message. */}
        {(request.riskScore != null ||
          request.riskNotes ||
          (request.status === "rejected" && request.rejectReason)) && (
          <RiskSection
            riskScore={request.riskScore}
            riskVerdict={request.riskVerdict}
            riskReasons={request.riskReasons}
            message={
              request.riskVerdict || request.riskReasons?.length ? undefined : request.riskNotes
            }
            rejectReason={request.status === "rejected" ? request.rejectReason : undefined}
          />
        )}

        {/* BscScan explorer link — executed requests */}
        {request.txHash && (
          <a
            href={`${BSC_EXPLORER_URL}/tx/${request.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_BUTTON_NEUTRAL}
          >
            <span className="relative w-[18px] h-[18px] shrink-0">
              <Image src="/bscscan.png" alt="" fill className="object-contain rounded" sizes="18px" />
            </span>
            View on BscScan
            <ExternalLink className="h-3.5 w-3.5 opacity-50" />
          </a>
        )}

        {/* Action buttons (only for queued requests) */}
        {request.status === "queued" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md bg-gold/8 px-3 py-2.5 text-xs text-foreground/80">
              <ShieldCheck className="h-4 w-4 text-gold shrink-0" />
              <span>Screened before sending. You may need to confirm in Telegram.</span>
            </div>
            <Button onClick={handleApprove} disabled={rejecting} className="w-full">
              Approve &amp; send
            </Button>

            {showRejectInput ? (
              <div className="space-y-2">
                <Input
                  type="text"
                  placeholder="Reason (optional)"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
                <Button
                  variant="danger"
                  onClick={handleReject}
                  loading={rejecting}
                  className="w-full"
                >
                  Confirm rejection
                </Button>
              </div>
            ) : (
              <Button
                variant="danger"
                onClick={() => setShowRejectInput(true)}
                className="w-full"
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
      subtitle: "Zhentan is screening this payment",
    },
    review: {
      title: "Pending review",
      subtitle: "Approve in your Telegram chat to release the payment",
    },
    executed: { title: "Payment sent", subtitle: "Executed on BNB Chain" },
    rejected: { title: "Payment blocked", subtitle: "Screening rejected this payment" },
    error: { title: "Couldn’t propose payment", subtitle: "Nothing was sent" },
  };

  const isLoading = phase === "proposing" || phase === "screening";
  const { title, subtitle } = copy[phase];

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {phase === "proposing" ? (
          <ThemeLoaderSpinner motion="scan" />
        ) : phase === "screening" ? (
          <MaoAvatar state="scanning" size={80} />
        ) : phase === "review" ? (
          <MaoAvatar state="asking" size={80} />
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
      <div className="flex items-center gap-3 rounded-md bg-foreground/6 p-4">
        <div className="w-10 h-10 rounded-md bg-foreground/8 flex items-center justify-center text-gold">
          {request.kind === "swap" ? <Repeat2 className="h-5 w-5" /> : <Send className="h-5 w-5" />}
        </div>
        <TokenGlyph
          symbol={request.kind === "swap" && request.fromToken ? request.fromToken : request.token}
          iconUrl={request.tokenIconUrl}
          size={24}
        />
        <span className="text-lg font-semibold text-foreground">
          {formatTokenAmount(request.amount)} {request.token}
        </span>
      </div>

      {request.to && (
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground/80">{request.kind === "swap" ? "Router" : "To"}</dt>
            <dd
              className="font-mono text-foreground truncate min-w-0 max-w-[50%] sm:max-w-[200px]"
              title={request.to}
            >
              {truncateAddress(request.to)}
            </dd>
          </div>
        </dl>
      )}

      {phase === "rejected" && resultReason && (
        <div className="rounded-md bg-danger/10 p-3">
          <p className="text-xs text-danger/70 mb-1">Reason</p>
          <p className="text-sm text-danger">{resultReason}</p>
        </div>
      )}

      {phase === "error" && errorMsg && (
        <div className="rounded-md bg-danger/10 p-3">
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
          <Button onClick={onRetry} className="w-full">
            Try again
          </Button>
          <Button variant="ghost" onClick={onDone} className="w-full">
            Close
          </Button>
        </div>
      ) : isLoading ? (
        <Button variant="ghost" onClick={onDone} className="w-full">
          Close
        </Button>
      ) : (
        <Button onClick={onDone} className="w-full">
          Done
        </Button>
      )}
    </div>
  );
}
