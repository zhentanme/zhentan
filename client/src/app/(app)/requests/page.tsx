"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { RequestList } from "@/components/RequestList";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/app/context/AuthContext";
import { useActivityData } from "@/app/context/ActivityDataContext";
import { useSafeAddress } from "@/lib/useSafeAddress";
import { proposeTransaction } from "@/lib/propose";
import { useApiClient } from "@/lib/api/client";
import { findFallbackTokenBySymbol } from "@/lib/tokenFallbacks";
import type { QueuedRequest, TokenPosition } from "@/types";
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

  // Requests come from the shared activity feed so this page, the nav badges and
  // the co-sign rail stay in sync (and a single poll backs all of them).
  const { requests, loading, refresh: refreshRequests } = useActivityData();
  const [tokens, setTokens] = useState<TokenPosition[]>([]);

  const fetchTokens = useCallback(async () => {
    if (!safeAddress) return;
    try {
      const data = await api.portfolio.get(safeAddress);
      setTokens(data.tokens);
    } catch {
      // silent
    }
  }, [safeAddress, api]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  // Resolve a request's token (symbol only) to a contract address + decimals,
  // preferring the user's portfolio and falling back to known BNB Chain tokens.
  const resolveToken = useCallback(
    (symbol: string) => {
      const sym = symbol.trim().toLowerCase();
      const fromPortfolio = tokens.find(
        (t) => t.symbol.toLowerCase() === sym && t.address
      );
      if (fromPortfolio) return fromPortfolio;
      return findFallbackTokenBySymbol(symbol);
    },
    [tokens]
  );

  // Approve = propose the payment. Requests always go through screening by
  // default (no screeningDisabled), so the agent co-signs after risk analysis.
  // Returns the proposed tx id so the dialog can track screening progress.
  const handleApprove = useCallback(
    async (request: QueuedRequest): Promise<{ txId: string }> => {
      if (!user || !wallet) throw new Error("Please log in first");

      const token = resolveToken(request.token);
      if (!token?.address) {
        throw new Error(`Unsupported token: ${request.token}`);
      }

      const pendingTx = await proposeTransaction({
        recipient: request.to,
        amount: String(request.amount),
        ownerAddress: wallet.address,
        getOwnerAccount,
        tokenAddress: token.address,
        tokenDecimals: token.decimals,
        tokenSymbol: token.symbol,
        tokenIconUrl: token.iconUrl ?? undefined,
        identityToken,
      });

      await api.requests.update({ id: request.id, status: "approved", txId: pendingTx.id });
      refreshRequests();
      return { txId: pendingTx.id };
    },
    [user, wallet, getOwnerAccount, identityToken, resolveToken, refreshRequests, api]
  );

  const handleReject = useCallback(
    async (request: QueuedRequest, reason: string) => {
      await api.requests.update({ id: request.id, status: "rejected", rejectReason: reason || undefined });
      refreshRequests();
    },
    [refreshRequests, api]
  );

  if (safeLoading || !safeAddress) {
    return (
      <div className="flex flex-col h-screen bg-background">
      
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gold border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
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
              <h1 className="text-lg font-semibold text-foreground">Requests</h1>
              <p className="text-xs text-muted-foreground/80">Invoices & payment approvals</p>
            </div>
          </motion.div>

          {!loading && requests.length === 0 ? (
            <motion.div variants={staggerItem}>
              <div className="py-16 rounded-2xl bg-foreground/2 border border-foreground/6">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="mb-4 w-12 h-12 rounded-2xl bg-foreground/6 flex items-center justify-center text-muted-foreground/80">
                    <FileText className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">No requests yet</p>
                  <p className="mt-1 text-xs text-muted-foreground/60">
                    Invoices and payment requests via Telegram or WhatsApp appear here
                  </p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div variants={staggerItem}>
              <RequestList
                requests={requests}
                loading={loading}
                onApprove={handleApprove}
                onReject={handleReject}
                onRefresh={refreshRequests}
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
