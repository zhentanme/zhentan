"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useApiClient } from "@/lib/api/client";
import { useActivityData } from "@/app/context/ActivityDataContext";
import { proposeTransaction } from "@/lib/propose";
import { findFallbackTokenBySymbol } from "@/lib/tokenFallbacks";
import type { QueuedRequest, TokenPosition } from "@/types";

/**
 * Approve / reject handlers for payment requests, shared by the requests page and
 * the home rail so a queued request can be acted on wherever its detail dialog is
 * opened. Approve = propose the payment (owner signs 1 of 2) → screening; reject =
 * bookkeeping update. Both refresh the shared activity feed afterwards.
 */
export function useRequestActions() {
  const { user, wallet, getOwnerAccount, safeAddress, identityToken } = useAuth();
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
      refresh();
      return { txId: pendingTx.id };
    },
    [user, wallet, getOwnerAccount, identityToken, resolveToken, refresh, api]
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
