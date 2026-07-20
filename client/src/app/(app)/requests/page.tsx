"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { RequestList } from "@/components/RequestList";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/app/context/AuthContext";
import { useActivityData } from "@/app/context/ActivityDataContext";
import { TwinTickLoader } from "@/components/TwinTickLoader";
import { proposeTransaction } from "@/lib/propose";
import { signSafeTx } from "@/lib/safe/safeTx";
import { useApiClient } from "@/lib/api/client";
import { findFallbackTokenBySymbol } from "@/lib/tokenFallbacks";
import type { Address } from "viem";
import type { QueuedRequest, TokenPosition } from "@/types";
import { FileText } from "lucide-react";

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
  const { user, wallet, getOwnerAccount, identityToken, safeAddress, safeLoading, safeConfig } = useAuth();
  const api = useApiClient();

  // Requests come from the shared activity feed so this page, the nav badges and
  // the co-sign rail stay in sync (and a single poll backs all of them).
  const { requests, loading, refresh: refreshRequests, queuedCount } = useActivityData();
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
      if (!safeAddress) throw new Error("Wallet not ready");

      // Auto-approve path: the agent already built + pre-signed this tx (1-of-2).
      // Fetch it, add the user's signature over the same safeTxHash, and the
      // relayer executes — no fresh proposal, no re-screening.
      if (request.txId) {
        const { transaction } = await api.transactions.get(request.txId);
        if (!transaction.safeTx || !transaction.safeAddress) {
          throw new Error("Pre-signed transaction is unavailable");
        }
        const account = await getOwnerAccount();
        if (!account) throw new Error("Wallet not ready for signing");
        const userSignature = await signSafeTx(
          account,
          transaction.safeAddress as Address,
          transaction.safeTx
        );
        await api.transactions.sign(request.txId, userSignature);
        refreshRequests();
        return { txId: request.txId };
      }

      // No pre-sign → the user proposes a fresh tx and it goes through screening.
      const token = resolveToken(request.token);
      if (!token?.address) {
        throw new Error(`Unsupported token: ${request.token}`);
      }

      if (!safeConfig) throw new Error("Wallet not ready");
      const pendingTx = await proposeTransaction({
        recipient: request.to,
        amount: String(request.amount),
        safe: { safeAddress, ...safeConfig },
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
    [user, wallet, getOwnerAccount, safeAddress, safeConfig, identityToken, resolveToken, refreshRequests, api]
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
          <TwinTickLoader variant="sequential" size={120} label="Loading requests" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <main className="flex-1 w-full px-4 sm:px-8 lg:px-10 py-6 sm:py-8 overflow-y-auto scrollbar-hide pb-24 sm:pb-10">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-5"
        >
          {/* Eyebrow */}
          <motion.div variants={staggerItem} className="flex items-center gap-3 !mb-6">
            <span className="eyebrow text-muted-foreground">Requests</span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </motion.div>

          {/* Title row */}
          <motion.div variants={staggerItem} className="flex items-end justify-between gap-4 !mb-5">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Invoices &amp; approvals</h1>
              <p className="text-[13px] text-muted-foreground/85 mt-1.5">
                Payment requests waiting on your signature.
              </p>
            </div>
            {queuedCount > 0 && (
              <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-watch/12 text-watch font-mono uppercase tracking-wider text-[11px]">
                {queuedCount} Queued
              </span>
            )}
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
