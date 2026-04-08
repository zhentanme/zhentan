"use client";

import { useRef, useEffect } from "react";
import { Button } from "./ui/Button";
import { useWalletConnect } from "@/app/context/WalletConnectContext";
import { Dialog } from "./ui/Dialog";
import { ThemeLoaderSpinner } from "./ThemeLoader";
import { ExternalLink, CheckCircle2, XCircle, PenLine } from "lucide-react";
import { hexToString, isHex } from "viem";
import type { DappMetadata } from "@/types";

function decodeMessage(method: string, params: unknown[]): string {
  try {
    if (method === "personal_sign") {
      const hex = params[0] as string;
      if (isHex(hex)) return hexToString(hex as `0x${string}`);
      return hex;
    }
    if (method === "eth_sign") {
      const hex = params[1] as string;
      if (isHex(hex)) return hexToString(hex as `0x${string}`);
      return hex;
    }
    // eth_signTypedData / eth_signTypedData_v4
    const raw = params[1] as string;
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(params[1] ?? params[0] ?? "");
  }
}

function methodLabel(method: string): string {
  if (method === "personal_sign" || method === "eth_sign") return "Sign Message";
  return "Sign Typed Data";
}

export function WCSignatureRequest() {
  const {
    pendingSignRequest,
    approveSignRequest,
    rejectSignRequest,
    signStatus,
    signResult,
    signError,
    resetSignState,
  } = useWalletConnect();

  const isOpen =
    !!pendingSignRequest ||
    signStatus === "signing" ||
    signStatus === "success" ||
    signStatus === "error";

  const lastRef = useRef<{
    decoded: string;
    label: string;
    dappMetadata?: DappMetadata;
  } | null>(null);

  if (pendingSignRequest) {
    lastRef.current = {
      decoded: decodeMessage(pendingSignRequest.method, pendingSignRequest.params),
      label: methodLabel(pendingSignRequest.method),
      dappMetadata: pendingSignRequest.dappMetadata,
    };
  }
  useEffect(() => {
    if (signStatus === "idle" && !pendingSignRequest) lastRef.current = null;
  }, [signStatus, pendingSignRequest]);

  if (!isOpen) return null;

  const dapp = pendingSignRequest?.dappMetadata ?? lastRef.current?.dappMetadata;
  const decoded = lastRef.current?.decoded ?? "";
  const label = lastRef.current?.label ?? "Sign";

  const isTypedData =
    pendingSignRequest?.method === "eth_signTypedData" ||
    pendingSignRequest?.method === "eth_signTypedData_v4";

  const handleClose = () => {
    if (signStatus === "signing") return;
    if (signStatus === "success" || signStatus === "error") {
      resetSignState();
      return;
    }
    rejectSignRequest();
  };

  const DappIcon = () => {
    if (dapp?.icons?.[0]) {
      return <img src={dapp.icons[0]} alt="" className="w-6 h-6 rounded-md shrink-0 bg-white/10" />;
    }
    return (
      <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center shrink-0">
        <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
      </div>
    );
  };

  return (
    <Dialog open onClose={handleClose} title={label}>
      {/* Signing in progress */}
      {signStatus === "signing" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-4">
            <ThemeLoaderSpinner variant="transaction" />
            <p className="text-sm font-semibold text-gold">Signing…</p>
            <p className="text-xs text-slate-500 uppercase tracking-widest">Awaiting your signature</p>
          </div>
          {dapp && (
            <div className="flex items-center gap-2">
              <DappIcon />
              <span className="text-sm text-slate-300 truncate">{dapp.name}</span>
            </div>
          )}
        </div>
      )}

      {/* Success */}
      {signStatus === "success" && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-2xl bg-gold/20 text-gold flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <span className="text-sm font-semibold text-gold">Signed</span>
          </div>
          {signResult && (
            <div className="rounded-xl bg-white/6 p-3">
              <p className="text-xs font-mono text-slate-400 break-all">
                {signResult.slice(0, 20)}…{signResult.slice(-10)}
              </p>
            </div>
          )}
          <Button type="button" onClick={resetSignState} className="w-full py-3.5">
            Done
          </Button>
        </div>
      )}

      {/* Error */}
      {signStatus === "error" && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-2xl bg-red-400/15 text-red-400 flex items-center justify-center">
              <XCircle className="h-10 w-10" />
            </div>
            <span className="text-sm font-semibold text-red-400">Failed</span>
            <p className="text-xs text-slate-500 text-center max-w-[280px]">
              {signError || "Unknown error"}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={resetSignState} className="w-full py-3.5">
            Close
          </Button>
        </div>
      )}

      {/* Idle / approval */}
      {signStatus === "idle" && pendingSignRequest && (
        <div className="flex flex-col gap-5">
          {dapp && (
            <div className="flex items-center gap-3">
              {dapp.icons?.[0] ? (
                <img src={dapp.icons[0]} alt="" className="w-10 h-10 rounded-xl bg-white/10 shrink-0" />
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

          {/* Message preview */}
          <div className="rounded-xl bg-white/6 p-3 flex items-start gap-2">
            <PenLine className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
            <pre className={`text-xs text-slate-300 whitespace-pre-wrap break-all min-w-0 max-h-48 overflow-y-auto ${isTypedData ? "font-mono" : ""}`}>
              {decoded}
            </pre>
          </div>

          <p className="text-xs text-slate-500 text-center">
            This signature is made by your owner wallet, not the Safe.
          </p>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={rejectSignRequest} className="flex-1">
              Reject
            </Button>
            <Button onClick={approveSignRequest} className="flex-1">
              Sign
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
