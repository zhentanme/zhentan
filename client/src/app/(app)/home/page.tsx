"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { BalanceCard } from "@/components/BalanceCard";
import { SendPanel } from "@/components/SendPanel";
import { ReceivePanel } from "@/components/ReceivePanel";
import { SwapPanel } from "@/components/SwapPanel";
import { WalletConnectPanel } from "@/components/WalletConnectPanel";
import { WCSessionProposal } from "@/components/WCSessionProposal";
import { WCTransactionRequest } from "@/components/WCTransactionRequest";
import { ActivityList } from "@/components/ActivityList";
import { TokenList } from "@/components/TokenList";
import { Dialog } from "@/components/ui/Dialog";
import { AuthGuard } from "@/components/AuthGuard";
import { ThemeLoader } from "@/components/ThemeLoader";
import { ClaimBanner } from "@/components/ClaimBanner";
import { useAuth } from "@/app/context/AuthContext";
import { useApiClient } from "@/lib/api/client";
import { padTokensWithFallbacks } from "@/lib/tokenFallbacks";
import type { TransactionWithStatus, StatusResponse, TokenPosition, PortfolioResponse } from "@/types";

function Dashboard() {
  const { user, safeAddress, safeLoading, telegramUserId } = useAuth();
  const api = useApiClient();

  const [username, setUsername] = useState<string | null>(null);
  const [portfolioTotalUsd, setPortfolioTotalUsd] = useState<number | null>(null);
  const [portfolioPercentChange24h, setPortfolioPercentChange24h] = useState<number | null>(null);
  const [tokens, setTokens] = useState<TokenPosition[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [transactions, setTransactions] = useState<TransactionWithStatus[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [screeningMode, setScreeningMode] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [listTab, setListTab] = useState<"tokens" | "activity">("tokens");

  const fetchPortfolio = useCallback(async () => {
    if (!safeAddress) return;
    try {
      const data: PortfolioResponse = await api.portfolio.get(safeAddress);
      setPortfolioTotalUsd(data.totalUsd);
      setPortfolioPercentChange24h(data.percentChange24h ?? null);
      setTokens(padTokensWithFallbacks(data.tokens ?? []));
    } catch {
      // silent
    } finally {
      setBalanceLoading(false);
    }
  }, [safeAddress, api]);

  const fetchTransactions = useCallback(async () => {
    if (!safeAddress) return;
    try {
      const data = await api.transactions.list(safeAddress);
      setTransactions(data.transactions);
    } catch {
      // silent
    } finally {
      setTxLoading(false);
    }
  }, [safeAddress, api]);

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
    if (!safeAddress) return;
    fetchPortfolio();
    fetchTransactions();
    fetchStatus();
    api.users.get(safeAddress).then((d) => setUsername(d?.username ?? null)).catch(() => {});
  }, [safeAddress, fetchPortfolio, fetchTransactions, fetchStatus, api]);

  const handleSendSuccess = () => {
    setSendOpen(false);
    fetchTransactions();
    fetchPortfolio();
  };

  const handleRefresh = useCallback(() => {
    setBalanceLoading(true);
    setTxLoading(true);
    fetchPortfolio();
    fetchTransactions();
  }, [fetchPortfolio, fetchTransactions]);

  if (safeLoading || !safeAddress) {
    return (
      <ThemeLoader
        variant="auth"
        message="Preparing your wallet..."
        subtext="Securing your session"
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">

      <main className="flex-1 flex flex-col min-h-0 w-full max-w-lg mx-auto overflow-y-auto pb-24 sm:pb-8">
        {/* Claim banner */}
        <ClaimBanner
          safeAddress={safeAddress}
          telegramUserId={telegramUserId}
          username={username}
          hideWhenClaimed
          onClaimed={() => {
            fetchPortfolio();
            fetchTransactions();
          }}
        />

        {/* Hero balance section */}
        <div className="shrink-0 hero-gradient-subtle">
          <BalanceCard
            portfolioTotalUsd={portfolioTotalUsd}
            portfolioPercentChange24h={portfolioPercentChange24h}
            safeAddress={safeAddress}
            loading={balanceLoading}
            name={
              user?.name?.trim() ||
              (user?.email
                ? user.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                : null)
            }
            onRefresh={handleRefresh}
            onToggleSend={() => {
              setSendOpen(!sendOpen);
              setReceiveOpen(false);
              setConnectOpen(false);
              setSwapOpen(false);
            }}
            onToggleReceive={() => {
              setReceiveOpen(!receiveOpen);
              setSendOpen(false);
              setConnectOpen(false);
              setSwapOpen(false);
            }}
            onToggleSwap={() => {
              setSwapOpen(!swapOpen);
              setSendOpen(false);
              setReceiveOpen(false);
              setConnectOpen(false);
            }}
            onToggleConnect={() => {
              setConnectOpen(!connectOpen);
              setSendOpen(false);
              setReceiveOpen(false);
              setSwapOpen(false);
            }}
            sendOpen={sendOpen}
            receiveOpen={receiveOpen}
            connectOpen={connectOpen}
            swapOpen={swapOpen}
          />
        </div>

        {/* Dialogs */}
        <Dialog
          open={sendOpen}
          onClose={() => setSendOpen(false)}
          title="Send crypto"
          className="max-w-md min-h-[28rem]"
        >
          <SendPanel
            onSuccess={handleSendSuccess}
            onClose={() => setSendOpen(false)}
            onRefreshActivities={fetchTransactions}
            tokens={tokens}
            screeningMode={screeningMode}
          />
        </Dialog>

        <Dialog open={receiveOpen} onClose={() => setReceiveOpen(false)}>
          <ReceivePanel safeAddress={safeAddress} />
        </Dialog>

        <Dialog
          open={swapOpen}
          onClose={() => setSwapOpen(false)}
          title="Swap tokens"
          className="max-w-md"
        >
          <SwapPanel
            onSuccess={() => {
              setSwapOpen(false);
              fetchPortfolio();
              fetchTransactions();
            }}
            onClose={() => setSwapOpen(false)}
            tokens={tokens}
          />
        </Dialog>

        <Dialog open={connectOpen} onClose={() => setConnectOpen(false)} title="Connect DApp">
          <WalletConnectPanel />
        </Dialog>

        <WCSessionProposal />
        <WCTransactionRequest />

        {/* Tokens / Activity tabs */}
        <motion.div
          className="flex-1 min-h-0 flex flex-col mx-4 sm:mx-0"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          {/* Tab bar */}
          <div className="flex items-center gap-1 mb-3">
            <button
              type="button"
              onClick={() => setListTab("tokens")}
              className={`relative px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                listTab === "tokens"
                  ? "text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Tokens
              {listTab === "tokens" && (
                <motion.div
                  className="absolute bottom-0 left-2 right-2 h-0.5 bg-gold rounded-full"
                  layoutId="tab-indicator"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
            </button>
            <button
              type="button"
              onClick={() => setListTab("activity")}
              className={`relative px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                listTab === "activity"
                  ? "text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Activity
              {listTab === "activity" && (
                <motion.div
                  className="absolute bottom-0 left-2 right-2 h-0.5 bg-gold rounded-full"
                  layoutId="tab-indicator"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 rounded-2xl bg-white/2 border border-white/6 overflow-hidden">
            <div className="h-full overflow-y-auto">
              {listTab === "tokens" ? (
                <TokenList tokens={tokens} loading={balanceLoading} embedded />
              ) : (
                <ActivityList transactions={transactions} loading={txLoading} embedded />
              )}
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <AuthGuard>
      <Dashboard />
    </AuthGuard>
  );
}
