"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/TopBar";
import { BalanceCard } from "@/components/BalanceCard";
import { SendPanel } from "@/components/SendPanel";
import { ReceivePanel } from "@/components/ReceivePanel";
import { WalletConnectPanel } from "@/components/WalletConnectPanel";
import { WCSessionProposal } from "@/components/WCSessionProposal";
import { WCTransactionRequest } from "@/components/WCTransactionRequest";
import { ActivityList } from "@/components/ActivityList";
import { TokenList } from "@/components/TokenList";
import { Dialog } from "@/components/ui/Dialog";
import { AuthGuard } from "@/components/AuthGuard";
import { ThemeLoader } from "@/components/ThemeLoader";
import { useAuth } from "@/app/context/AuthContext";
import { useApiClient } from "@/lib/api/client";
import type { TransactionWithStatus, StatusResponse, TokenPosition, PortfolioResponse } from "@/types";

function Dashboard() {
  const { user, safeAddress, safeLoading } = useAuth();
  const api = useApiClient();

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
  const [listTab, setListTab] = useState<"tokens" | "activity">("activity");

  const fetchPortfolio = useCallback(async () => {
    if (!safeAddress) return;
    try {
      const data: PortfolioResponse = await api.portfolio.get(safeAddress);
      setPortfolioTotalUsd(data.totalUsd);
      setPortfolioPercentChange24h(data.percentChange24h ?? null);
      setTokens(data.tokens ?? []);
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
  }, [safeAddress, fetchPortfolio, fetchTransactions, fetchStatus]);

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
    <div className="flex flex-col h-screen min-h-0 cosmic-bg starfield">
      <TopBar screeningMode={screeningMode} />

      <main className="flex-1 flex flex-col min-h-0 w-full px-4 py-5 sm:p-6 md:p-8 max-w-4xl mx-auto overflow-y-auto">
        <div className="flex-shrink-0 mb-4 sm:mb-6">
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
            }}
            onToggleReceive={() => {
              setReceiveOpen(!receiveOpen);
              setSendOpen(false);
              setConnectOpen(false);
            }}
            onToggleConnect={() => {
              setConnectOpen(!connectOpen);
              setSendOpen(false);
              setReceiveOpen(false);
            }}
            sendOpen={sendOpen}
            receiveOpen={receiveOpen}
            connectOpen={connectOpen}
          />
        </div>

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

        <Dialog open={connectOpen} onClose={() => setConnectOpen(false)} title="Connect DApp">
          <WalletConnectPanel />
        </Dialog>

        <WCSessionProposal />
        <WCTransactionRequest />

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden glass-card rounded-2xl">
          <div className="flex-shrink-0 flex border-b border-white/[0.08] p-6 pb-0 gap-8">
            <button
              type="button"
              onClick={() => setListTab("tokens")}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 -mb-px ${
                listTab === "tokens"
                  ? "text-claw border-claw"
                  : "text-slate-400 border-transparent hover:text-slate-300"
              }`}
            >
              Tokens
            </button>
            <button
              type="button"
              onClick={() => setListTab("activity")}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 -mb-px ${
                listTab === "activity"
                  ? "text-claw border-claw"
                  : "text-slate-400 border-transparent hover:text-slate-300"
              }`}
            >
              Activity
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {listTab === "tokens" ? (
              <TokenList tokens={tokens} loading={balanceLoading} embedded />
            ) : (
              <ActivityList transactions={transactions} loading={txLoading} embedded />
            )}
          </div>
        </div>
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
