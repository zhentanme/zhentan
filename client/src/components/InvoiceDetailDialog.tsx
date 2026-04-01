"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { QueuedInvoice } from "@/types";
import { truncateAddress, formatDate } from "@/lib/format";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { UsdcIcon } from "./icons/UsdcIcon";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
} from "lucide-react";
import { clsx } from "clsx";

interface InvoiceDetailDialogProps {
  invoice: QueuedInvoice | null;
  open: boolean;
  onClose: () => void;
  onApprove?: (invoice: QueuedInvoice) => Promise<void>;
  onReject?: (invoice: QueuedInvoice, reason: string) => Promise<void>;
}

function StatusAnimation({ status }: { status: QueuedInvoice["status"] }) {
  const common = "rounded-2xl flex items-center justify-center";
  const size = "w-20 h-20";

  switch (status) {
    case "queued":
      return (
        <motion.div
          className={`${size} ${common} bg-amber-400/15 text-amber-400`}
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
          className={`${size} ${common} bg-red-400/15 text-red-400`}
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
        ? "bg-amber-400/15 text-amber-400"
        : "bg-red-400/15 text-red-400";
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

const statusLabels: Record<QueuedInvoice["status"], string> = {
  queued: "Queued for Review",
  approved: "Approved",
  executed: "Executed",
  rejected: "Rejected",
};

export function InvoiceDetailDialog({
  invoice,
  open,
  onClose,
  onApprove,
  onReject,
}: InvoiceDetailDialogProps) {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  if (!invoice) return null;

  const handleApprove = async () => {
    if (!onApprove) return;
    setApproving(true);
    try {
      await onApprove(invoice);
      onClose();
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!onReject) return;
    setRejecting(true);
    try {
      await onReject(invoice, rejectReason);
      setRejectReason("");
      setShowRejectInput(false);
      onClose();
    } finally {
      setRejecting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Invoice details"
      className="max-w-md"
    >
      <div className="space-y-6">
        {/* Status animation */}
        <div className="flex flex-col items-center gap-3">
          <StatusAnimation status={invoice.status} />
          <span
            className={clsx(
              "text-sm font-semibold",
              invoice.status === "executed" || invoice.status === "approved"
                ? "text-gold"
                : invoice.status === "rejected"
                  ? "text-red-400"
                  : "text-amber-400"
            )}
          >
            {statusLabels[invoice.status]}
          </span>
        </div>

        {/* Amount row */}
        <div className="flex items-center gap-3 rounded-2xl bg-white/6 p-4">
          <div className="w-10 h-10 rounded-2xl bg-white/8 flex items-center justify-center text-gold">
            <FileText className="h-5 w-5" />
          </div>
          <UsdcIcon size={24} className="shrink-0 opacity-90" />
          <span className="text-lg font-semibold text-white">
            {invoice.amount} {invoice.token}
          </span>
        </div>

        {/* Invoice metadata */}
        <dl className="space-y-3 text-sm">
          {invoice.invoiceNumber && (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Invoice #</dt>
              <dd className="text-slate-300">{invoice.invoiceNumber}</dd>
            </div>
          )}
          {invoice.issueDate && (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Issue Date</dt>
              <dd className="text-slate-300">{invoice.issueDate}</dd>
            </div>
          )}
          {invoice.dueDate && (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Due Date</dt>
              <dd className="text-slate-300">{invoice.dueDate}</dd>
            </div>
          )}

          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Queued</dt>
            <dd className="text-slate-300">{formatDate(invoice.queuedAt)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">To</dt>
            <dd
              className="font-mono text-slate-200 truncate min-w-0 max-w-[50%] sm:max-w-[200px]"
              title={invoice.to}
            >
              {truncateAddress(invoice.to)}
            </dd>
          </div>
        </dl>

        {/* Services table */}
        {invoice.services && invoice.services.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-2">Services</p>
            <div className="rounded-2xl bg-white/4 overflow-x-auto scrollbar-hide -mx-1">
              <table className="w-full text-sm min-w-[280px]">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-white/6">
                    <th className="px-2 sm:px-3 py-2 font-medium">Description</th>
                    <th className="px-2 sm:px-3 py-2 font-medium text-right whitespace-nowrap">Qty</th>
                    <th className="px-2 sm:px-3 py-2 font-medium text-right whitespace-nowrap">Rate</th>
                    <th className="px-2 sm:px-3 py-2 font-medium text-right whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.services.map((svc, i) => (
                    <tr
                      key={i}
                      className="border-b border-white/[0.04] last:border-0"
                    >
                      <td className="px-2 sm:px-3 py-2 text-slate-300 min-w-0">
                        {svc.description}
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-slate-400 text-right whitespace-nowrap">
                        {svc.qty}
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-slate-400 text-right whitespace-nowrap">
                        {svc.rate}
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-slate-200 text-right whitespace-nowrap">
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
        {invoice.riskScore != null && (
          <div className="rounded-2xl bg-white/4 p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-500">Risk Assessment</p>
              <RiskBadge score={invoice.riskScore} />
            </div>
            {invoice.riskNotes && (
              <p className="text-xs text-slate-400">{invoice.riskNotes}</p>
            )}
          </div>
        )}

        {/* Rejection info */}
        {invoice.status === "rejected" && invoice.rejectReason && (
          <div className="rounded-2xl bg-red-400/10 p-3">
            <p className="text-xs text-red-400/70 mb-1">Rejection Reason</p>
            <p className="text-sm text-red-400">{invoice.rejectReason}</p>
          </div>
        )}

        {/* Action buttons (only for queued invoices) */}
        {invoice.status === "queued" && (
          <div className="space-y-3">
            <Button
              onClick={handleApprove}
              loading={approving}
              disabled={rejecting}
              className="w-full py-3.5"
            >
              Approve & Send
            </Button>

            {showRejectInput ? (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Reason (optional)"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full rounded-2xl bg-white/6 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-400/40 transition-all"
                />
                <Button
                  variant="secondary"
                  onClick={handleReject}
                  loading={rejecting}
                  disabled={approving}
                  className="w-full py-3 text-red-400 hover:text-red-300"
                >
                  Confirm Reject
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                onClick={() => setShowRejectInput(true)}
                disabled={approving}
                className="w-full py-3 text-red-400 hover:text-red-300"
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
