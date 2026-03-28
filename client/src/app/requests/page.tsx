"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { TopBar } from "@/components/TopBar";
import { InvoiceList } from "@/components/InvoiceList";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/app/context/AuthContext";
import { useSafeAddress } from "@/lib/useSafeAddress";
import { proposeTransaction } from "@/lib/propose";
import { useApiClient } from "@/lib/api/client";
import type { QueuedInvoice, StatusResponse } from "@/types";
import { FileText } from "lucide-react";

const emptyVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, type: "spring" as const, bounce: 0.18 },
  },
};

function RequestsPageContent() {
  const { user, wallet, getOwnerAccount, identityToken } = useAuth();
  const { safeAddress, loading: safeLoading } = useSafeAddress(wallet?.address);
  const api = useApiClient();

  const [invoices, setInvoices] = useState<QueuedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [screeningMode, setScreeningMode] = useState(false);

  const fetchInvoices = useCallback(async () => {
    try {
      const data = await api.invoices.list();
      setInvoices(data.invoices);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchStatus = useCallback(async () => {
    if (!safeAddress) return;
    try {
      const data: StatusResponse = await api.status.get(safeAddress);
      setScreeningMode(data.screeningMode);
    } catch {
      // silent
    }
  }, [safeAddress, api]);

  useEffect(() => {
    fetchInvoices();
    fetchStatus();
  }, [fetchInvoices, fetchStatus]);

  const handleApprove = useCallback(
    async (invoice: QueuedInvoice) => {
      if (!user || !wallet) throw new Error("Please log in first");

      const pendingTx = await proposeTransaction({
        recipient: invoice.to,
        amount: String(invoice.amount),
        ownerAddress: wallet.address,
        getOwnerAccount,
        identityToken,
      });

      await api.invoices.update({ id: invoice.id, status: "approved", txId: pendingTx.id });

      if (!screeningMode) {
        await api.execute.run(pendingTx.id);
        await api.invoices.update({ id: invoice.id, status: "executed" });
      }

      fetchInvoices();
    },
    [user, wallet, getOwnerAccount, screeningMode, fetchInvoices, api]
  );

  const handleReject = useCallback(
    async (invoice: QueuedInvoice, reason: string) => {
      await api.invoices.update({ id: invoice.id, status: "rejected", rejectReason: reason || undefined });
      fetchInvoices();
    },
    [fetchInvoices, api]
  );

  if (safeLoading || !safeAddress) {
    return (
      <div className="flex flex-col min-h-screen cosmic-bg starfield">
        <TopBar screeningMode={false} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-claw border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen cosmic-bg starfield">
      <TopBar screeningMode={screeningMode} />
      <main className="flex-1 w-full px-4 py-5 sm:p-6 md:p-8 max-w-4xl mx-auto overflow-y-auto">
        {!loading && invoices.length === 0 ? (
          <motion.div
            className="flex flex-col items-center gap-4 py-24"
            initial="hidden"
            animate="visible"
            variants={emptyVariants}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <FileText className="h-12 w-12 text-slate-600" />
            </motion.div>
            <motion.h1
              className="text-xl font-semibold text-slate-300"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              No requests yet
            </motion.h1>
            <motion.p
              className="text-sm text-slate-500 text-center max-w-sm"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              Invoices sent via Telegram or WhatsApp will appear here for review.
            </motion.p>
          </motion.div>
        ) : (
          <InvoiceList
            invoices={invoices}
            loading={loading}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        )}
      </main>
    </div>
  );
}

export default function RequestsPage() {
  return (
    <AuthGuard>
      <RequestsPageContent />
    </AuthGuard>
  );
}
