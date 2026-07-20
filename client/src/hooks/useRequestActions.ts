"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useApiClient } from "@/lib/api/client";
import { useActivityData } from "@/app/context/ActivityDataContext";
import { proposeTransaction } from "@/lib/propose";
import { signSafeTx } from "@/lib/safe/safeTx";
import { findFallbackTokenBySymbol } from "@/lib/tokenFallbacks";
import type { Address } from "viem";
import type { QueuedRequest, TokenPosition } from "@/types";

/**
 * Approve / reject handlers for payment requests, shared by the requests page and
 * the home rail so a queued request can be acted on wherever its detail dialog is
 * opened. Approve = propose the payment (owner signs 1 of 2) → screening; reject =
 * bookkeeping update. Both refresh the shared activity feed afterwards.
 */
export function useRequestActions() {
  const { user, wallet, getOwnerAccount, safeAddress, safeConfig, identityToken } = useAuth();
  const api = useApiClient();
  const { refresh } = useActivityData();
  const [tokens, setTokens] = useState<TokenPosition[]>([]);

  const fetchTokens = useCallback(async () => {
    if (!safeAddress) return;
    try {
      const data = await api.portfolio.get(safeAddress);
      setTokens(data.tokens);
    } catch {
      // silent — resolveToken falls back to known BNB Chain tokens
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

  const handleApprove = useCallback(
    async (request: QueuedRequest): Promise<{ txId: string }> => {
      if (!user || !wallet) throw new Error("Please log in first");
      if (!safeAddress) throw new Error("Wallet not ready");

      // Auto-approve path: the agent already built + pre-signed this tx (1-of-2).
      // Fetch it, add the user's signature over the same safeTxHash, and the
      // relayer executes — no fresh proposal (which would fork to a new nonce).
      // Kept in sync with the requests page handler; both branch on request.txId.
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
        refresh();
        return { txId: request.txId };
      }

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
      refresh();
      return { txId: pendingTx.id };
    },
    [user, wallet, getOwnerAccount, safeAddress, safeConfig, identityToken, resolveToken, refresh, api]
  );

  const handleReject = useCallback(
    async (request: QueuedRequest, reason: string) => {
      await api.requests.update({
        id: request.id,
        status: "rejected",
        rejectReason: reason || undefined,
      });
      refresh();
    },
    [refresh, api]
  );

  return { handleApprove, handleReject, refresh };
}
