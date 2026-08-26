"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "./ui/Button";
import { useWalletConnect } from "@/app/context/WalletConnectContext";
import { Dialog } from "./ui/Dialog";
import { ThemeLoaderSpinner } from "./ThemeLoader";
import { ExecutedAnimation } from "./animations/StatusAnimation";
import { MaoAvatar } from "./MaoAvatar";
import { ScreeningNote, LINK_BUTTON_NEUTRAL } from "./txPresentation";
import { truncateAddress, truncateHex, formatDate } from "@/lib/format";
import { BSC_EXPLORER_URL } from "@/lib/constants";
import { ExternalLink, XCircle, ArrowUpRight } from "lucide-react";
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
      ? truncateHex(txParams.data)
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
    ? (txParams.data && txParams.data !== "0x" ? truncateHex(txParams.data) : "No calldata")
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
          className="w-6 h-6 rounded-md shrink-0 bg-foreground/10"
        />
      );
    }
    return (
      <div className="w-6 h-6 rounded-md bg-foreground/10 flex items-center justify-center shrink-0">
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
    );
  };

  // Amount badge — matches SendPanel's "amount + icon" row
  const AmountBadge = () => (
    <div className="flex items-center gap-3 rounded-md bg-foreground/6 p-4">
      <div className="w-10 h-10 rounded-md bg-foreground/8 flex items-center justify-center text-gold">
        <ArrowUpRight className="h-5 w-5" />
      </div>
      <DappIcon />
      <span className="text-lg font-semibold text-foreground">
        {valueFormatted} BNB
      </span>
    </div>
  );

  return (
    <Dialog open onClose={handleClose} title="Transaction request">
      {/* Signing phase — matches SendPanel's "proposing" phase */}
      {requestStatus === "signing" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-4">
            <ThemeLoaderSpinner motion="scan" />
            <p className="text-sm font-semibold text-gold">Proposing transaction</p>
            <p className="text-xs text-muted-foreground/80">Awaiting your signature</p>
          </div>
          <AmountBadge />
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground/80">To</dt>
              <dd className="font-mono text-foreground truncate min-w-0 max-w-[50%] sm:max-w-[200px]" title={toAddress}>
                {truncateAddress(toAddress)}
              </dd>
            </div>
            {dapp && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground/80">dApp</dt>
                <dd className="text-foreground/80 truncate min-w-0 max-w-[50%] sm:max-w-[200px]">{dapp.name}</dd>
              </div>
            )}
            {calldataDisplay !== "No calldata" && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground/80">Data</dt>
                <dd className="font-mono text-muted-foreground text-xs truncate min-w-0 max-w-[50%] sm:max-w-[200px]">{calldataDisplay}</dd>
              </div>
            )}
          </dl>
          <Button type="button" variant="ghost" onClick={handleClose} className="w-full">
            Close
          </Button>
        </div>
      )}

      {/* Polling phase — matches SendPanel's "proposed/pending" phase */}
      {requestStatus === "polling" && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <MaoAvatar state="scanning" size={80} />
            <span className="text-sm font-semibold text-watch">Pending</span>
            <p className="text-xs text-muted-foreground/80">Zhentan is screening this transaction</p>
          </div>
          <AmountBadge />
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground/80">To</dt>
              <dd className="font-mono text-foreground truncate min-w-0 max-w-[50%] sm:max-w-[200px]" title={toAddress}>
                {truncateAddress(toAddress)}
              </dd>
            </div>
            {dapp && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground/80">dApp</dt>
                <dd className="text-foreground/80 truncate min-w-0 max-w-[50%] sm:max-w-[200px]">{dapp.name}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground/80">Proposed</dt>
              <dd className="text-foreground/80">{formatDate(new Date().toISOString())}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground/80">Signatures</dt>
              <dd className="text-foreground/80">1 of 2</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Success phase — matches SendPanel's "success" phase */}
      {requestStatus === "success" && requestTxHash && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <ExecutedAnimation size={80} />
            <span className="text-sm font-semibold text-safe">Executed</span>
          </div>
          <AmountBadge />
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground/80">To</dt>
              <dd className="font-mono text-foreground truncate min-w-0 max-w-[50%] sm:max-w-[200px]" title={toAddress}>
                {truncateAddress(toAddress)}
              </dd>
            </div>
            {dapp && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground/80">dApp</dt>
                <dd className="text-foreground/80 truncate min-w-0 max-w-[50%] sm:max-w-[200px]">{dapp.name}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground/80">Executed</dt>
              <dd className="text-foreground/80">{formatDate(new Date().toISOString())}</dd>
            </div>
          </dl>
          <a
            href={`${BSC_EXPLORER_URL}/tx/${requestTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_BUTTON_NEUTRAL}
          >
            <span className="relative w-[18px] h-[18px] shrink-0">
              <Image src="/bscscan.png" alt="" fill className="object-contain rounded" sizes="18px" />
            </span>
            View on BscScan
          </a>
          <Button type="button" onClick={resetRequestState} className="w-full">
            Done
          </Button>
        </div>
      )}

      {/* Error phase — matches SendPanel's error styling */}
      {requestStatus === "error" && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-md bg-danger/15 text-danger flex items-center justify-center">
              <XCircle className="h-10 w-10" />
            </div>
            <span className="text-sm font-semibold text-danger">Failed</span>
            <p className="text-xs text-muted-foreground/80 text-center max-w-[280px]">
              {requestError || "Something went wrong. Nothing was executed."}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={resetRequestState} className="w-full">
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
                  className="w-10 h-10 rounded-md bg-foreground/10 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-md bg-foreground/10 flex items-center justify-center shrink-0">
                  <ExternalLink className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{dapp.name}</p>
                <p className="text-xs text-muted-foreground/80 truncate">{dapp.url}</p>
              </div>
            </div>
          )}

          <AmountBadge />

          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground/80">To</dt>
              <dd className="font-mono text-foreground truncate min-w-0 max-w-[50%] sm:max-w-[200px]" title={toAddress}>
                {truncateAddress(toAddress)}
              </dd>
            </div>
            {calldataDisplay !== "No calldata" && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground/80">Data</dt>
                <dd className="font-mono text-muted-foreground text-xs truncate min-w-0 max-w-[50%] sm:max-w-[200px]">{calldataDisplay}</dd>
              </div>
            )}
          </dl>

          <ScreeningNote>Queued for screening before execution.</ScreeningNote>

          <div className="flex gap-3">
            <Button variant="danger" onClick={rejectRequest} className="flex-1">
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
