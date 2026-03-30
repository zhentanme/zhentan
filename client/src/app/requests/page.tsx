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
import { FileText, Bell } from "lucide-react";

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, type: "spring" as const, bounce: 0.15 },
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
      <div className="flex flex-col h-screen bg-background">
        <TopBar screeningMode={false} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gold border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar screeningMode={screeningMode} />
      <main className="flex-1 w-full px-4 py-5 sm:p-6 max-w-lg mx-auto overflow-y-auto pb-24 sm:pb-8">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-5"
        >
          {/* Page Header */}
          <motion.div variants={staggerItem} className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-gold/10 flex items-center justify-center">
              <Bell className="h-[18px] w-[18px] text-gold" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Requests</h1>
              <p className="text-xs text-slate-500">Invoices & payment approvals</p>
            </div>
          </motion.div>

          {!loading && invoices.length === 0 ? (
            <motion.div variants={staggerItem}>
              <div className="py-16 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="mb-4 w-12 h-12 rounded-2xl bg-white/[0.06] flex items-center justify-center text-slate-500">
                    <FileText className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-slate-400">No requests yet</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Invoices via Telegram or WhatsApp appear here
                  </p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div variants={staggerItem}>
              <InvoiceList
                invoices={invoices}
                loading={loading}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            </motion.div>
          )}
        </motion.div>
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
