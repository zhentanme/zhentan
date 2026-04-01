"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "./ui/Button";
import { useWalletConnect } from "@/app/context/WalletConnectContext";
import { Dialog } from "./ui/Dialog";
import { ThemeLoaderSpinner } from "./ThemeLoader";
import { truncateAddress, formatDate } from "@/lib/format";
import { BSC_EXPLORER_URL } from "@/lib/constants";
import { Shield, ExternalLink, CheckCircle2, XCircle, ArrowUpRight, Clock } from "lucide-react";
import { formatEther } from "viem";
import type { DappMetadata } from "@/types";

type TxParams = { to?: string; value?: string; data?: string };

function formatValue(value: string | undefined): string {
  if (!value || value === "0x0" || value === "0" || value === "0x") return "0";
  try {
    return formatEther(BigInt(value));
  } catch {
    return "0";
  }
}

export function WCTransactionRequest() {
  const {
    pendingRequest,
    approveRequest,
    rejectRequest,
    requestStatus,
    requestTxHash,
    requestError,
    resetRequestState,
  } = useWalletConnect();

  const isOpen = !!pendingRequest || requestStatus === "signing" || requestStatus === "polling" || requestStatus === "success" || requestStatus === "error";

  if (!isOpen) return null;

  const txParams = pendingRequest
    ? (pendingRequest.params as Array<TxParams>)[0]
    : null;

  const lastParamsRef = useRef<{
    to: string;
    valueFormatted: string;
    calldataDisplay: string;
    dappMetadata?: DappMetadata;
  } | null>(null);
  if (txParams) {
    const to = txParams.to ?? "";
    const valueFormatted = formatValue(txParams.value);
    const calldataDisplay = txParams.data && txParams.data !== "0x"
      ? `${txParams.data.slice(0, 10)}...${txParams.data.slice(-8)}`
      : "No calldata";
    lastParamsRef.current = { to, valueFormatted, calldataDisplay, dappMetadata: pendingRequest?.dappMetadata };
  }
  useEffect(() => {
    if (requestStatus === "idle" && !pendingRequest) lastParamsRef.current = null;
  }, [requestStatus, pendingRequest]);

  const dapp = pendingRequest?.dappMetadata ?? lastParamsRef.current?.dappMetadata;
  const display = lastParamsRef.current;
  const toAddress = txParams?.to ?? display?.to ?? "";
  const valueFormatted = txParams ? formatValue(txParams.value) : (display?.valueFormatted ?? "0");
  const calldataDisplay = txParams
    ? (txParams.data && txParams.data !== "0x" ? `${txParams.data.slice(0, 10)}...${txParams.data.slice(-8)}` : "No calldata")
    : (display?.calldataDisplay ?? "No calldata");

  const handleClose = () => {
    if (requestStatus === "signing" || requestStatus === "polling") return;
    if (requestStatus === "success" || requestStatus === "error") {
      resetRequestState();
      return;
    }
    rejectRequest();
  };

  // DApp icon helper
  const DappIcon = () => {
    if (dapp?.icons?.[0]) {
      return (
        <img
          src={dapp.icons[0]}
          alt=""
          className="w-6 h-6 rounded-md shrink-0 bg-white/10"
        />
      );
    }
    return (
      <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center shrink-0">
        <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
      </div>
    );
  };

  // Amount badge — matches SendPanel's "amount + icon" row
  const AmountBadge = () => (
    <div className="flex items-center gap-3 rounded-2xl bg-white/6 p-4">
      <div className="w-10 h-10 rounded-2xl bg-white/8 flex items-center justify-center text-gold">
        <ArrowUpRight className="h-5 w-5" />
      </div>
      <DappIcon />
      <span className="text-lg font-semibold text-white">
        {valueFormatted} BNB
      </span>
    </div>
  );

  return (
    <Dialog open onClose={handleClose} title="Transaction Request">
      {/* Signing phase — matches SendPanel's "proposing" phase */}
      {requestStatus === "signing" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-4">
            <ThemeLoaderSpinner variant="transaction" />
            <p className="text-sm font-semibold text-gold">Proposing transaction</p>
            <p className="text-xs text-slate-500 uppercase tracking-widest">Awaiting your signature</p>
          </div>
          <AmountBadge />
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">To</dt>
              <dd className="font-mono text-slate-200 truncate min-w-0 max-w-[50%] sm:max-w-[200px]" title={toAddress}>
                {truncateAddress(toAddress)}
              </dd>
            </div>
            {dapp && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">DApp</dt>
                <dd className="text-slate-300 truncate min-w-0 max-w-[50%] sm:max-w-[200px]">{dapp.name}</dd>
              </div>
            )}
            {calldataDisplay !== "No calldata" && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Data</dt>
                <dd className="font-mono text-slate-400 text-xs truncate min-w-0 max-w-[50%] sm:max-w-[200px]">{calldataDisplay}</dd>
              </div>
            )}
          </dl>
          <Button type="button" variant="ghost" onClick={handleClose} className="w-full py-3 text-slate-400 hover:text-slate-200">
            Close
          </Button>
        </div>
      )}

      {/* Polling phase — matches SendPanel's "proposed/pending" phase */}
      {requestStatus === "polling" && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <motion.div
              className="w-20 h-20 rounded-2xl bg-amber-400/15 text-amber-400 flex items-center justify-center"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, rotate: [0, 5, -5, 0] }}
              transition={{
                opacity: { duration: 0.3 },
                scale: { type: "spring", bounce: 0.4 },
                rotate: { repeat: Infinity, duration: 2, ease: "easeInOut" },
              }}
            >
              <Clock className="h-10 w-10" />
            </motion.div>
            <span className="text-sm font-semibold text-amber-400">Pending</span>
            <p className="text-xs text-slate-500">Your AI agent is reviewing this transaction</p>
          </div>
          <AmountBadge />
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">To</dt>
              <dd className="font-mono text-slate-200 truncate min-w-0 max-w-[50%] sm:max-w-[200px]" title={toAddress}>
                {truncateAddress(toAddress)}
              </dd>
            </div>
            {dapp && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">DApp</dt>
                <dd className="text-slate-300 truncate min-w-0 max-w-[50%] sm:max-w-[200px]">{dapp.name}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Proposed</dt>
              <dd className="text-slate-300">{formatDate(new Date().toISOString())}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Signatures</dt>
              <dd className="text-slate-300">1 of 2</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Success phase — matches SendPanel's "success" phase */}
      {requestStatus === "success" && requestTxHash && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-2xl bg-gold/20 text-gold flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <span className="text-sm font-semibold text-gold">Executed</span>
          </div>
          <AmountBadge />
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">To</dt>
              <dd className="font-mono text-slate-200 truncate min-w-0 max-w-[50%] sm:max-w-[200px]" title={toAddress}>
                {truncateAddress(toAddress)}
              </dd>
            </div>
            {dapp && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">DApp</dt>
                <dd className="text-slate-300 truncate min-w-0 max-w-[50%] sm:max-w-[200px]">{dapp.name}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Executed</dt>
              <dd className="text-slate-300">{formatDate(new Date().toISOString())}</dd>
            </div>
          </dl>
          <a
            href={`${BSC_EXPLORER_URL}/tx/${requestTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-2xl py-3 bg-white/8 text-slate-300 hover:text-white hover:bg-white/12 transition-colors text-sm font-medium"
          >
            <span className="relative w-[18px] h-[18px] shrink-0">
              <Image src="/bscscan.png" alt="" fill className="object-contain rounded" sizes="18px" />
            </span>
            View on BSC Explorer
          </a>
          <Button type="button" onClick={resetRequestState} className="w-full py-3.5">
            Done
          </Button>
        </div>
      )}

      {/* Error phase — matches SendPanel's error styling */}
      {requestStatus === "error" && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-2xl bg-red-400/15 text-red-400 flex items-center justify-center">
              <XCircle className="h-10 w-10" />
            </div>
            <span className="text-sm font-semibold text-red-400">Failed</span>
            <p className="text-xs text-slate-500 text-center max-w-[280px]">
              {requestError || "Unknown error"}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={resetRequestState} className="w-full py-3.5">
            Close
          </Button>
        </div>
      )}

      {/* Idle/approval phase — initial DApp tx request */}
      {requestStatus === "idle" && pendingRequest && txParams && (
        <div className="flex flex-col gap-6">
          {/* DApp info header */}
          {dapp && (
            <div className="flex items-center gap-3">
              {dapp.icons?.[0] ? (
                <img
                  src={dapp.icons[0]}
                  alt=""
                  className="w-10 h-10 rounded-xl bg-white/10 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                  <ExternalLink className="h-5 w-5 text-slate-400" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{dapp.name}</p>
                <p className="text-xs text-slate-500 truncate">{dapp.url}</p>
              </div>
            </div>
          )}

          <AmountBadge />

          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">To</dt>
              <dd className="font-mono text-slate-200 truncate min-w-0 max-w-[50%] sm:max-w-[200px]" title={toAddress}>
                {truncateAddress(toAddress)}
              </dd>
            </div>
            {calldataDisplay !== "No calldata" && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Data</dt>
                <dd className="font-mono text-slate-400 text-xs truncate min-w-0 max-w-[50%] sm:max-w-[200px]">{calldataDisplay}</dd>
              </div>
            )}
          </dl>

          {/* Security note */}
          <div className="flex items-start gap-3 rounded-xl bg-gold/[0.08] border border-gold/20 px-4 py-3">
            <Shield className="h-5 w-5 text-gold shrink-0 mt-0.5" />
            <p className="text-xs text-slate-300 leading-relaxed">
              This transaction will be queued for AI screening before execution.
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={rejectRequest} className="flex-1">
              Reject
            </Button>
            <Button onClick={approveRequest} className="flex-1">
              Approve
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
