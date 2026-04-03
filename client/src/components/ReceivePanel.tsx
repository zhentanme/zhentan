"use client";

import { useState } from "react";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, ArrowDownLeft } from "lucide-react";
import { truncateAddress } from "@/lib/format";

interface ReceivePanelProps {
  safeAddress: string;
}

export function ReceivePanel({ safeAddress }: ReceivePanelProps) {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(safeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center text-center gap-5 pb-1">
      <div className="w-12 h-12 rounded-2xl bg-white/8 flex items-center justify-center text-gold">
        <ArrowDownLeft className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-white tracking-wide inline-flex items-center gap-2">
          <Image src="/bsc-yellow.png" alt="" width={18} height={18} className="object-contain" />
          Receive on BNB Chain
        </h2>
        <p className="text-xs text-slate-500 uppercase tracking-widest">Deposit any assets on BNB Chain</p>
      </div>

      <div className="p-4 sm:p-5 bg-white rounded-2xl shadow-[0_8px_32px_-8px_rgba(0,0,0,0.2)] inline-flex">
        <QRCodeSVG value={safeAddress} size={148} />
      </div>

      <button
        type="button"
        onClick={copyAddress}
        className="w-full rounded-2xl bg-white/6 hover:bg-white/10 transition-colors px-3 py-3 text-left min-h-11 touch-manipulation cursor-pointer"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs sm:text-sm text-slate-300 break-all">
            {truncateAddress(safeAddress, 32)}
          </span>
          {copied ? (
            <Check className="h-4 w-4 text-gold shrink-0" />
          ) : (
            <Copy className="h-4 w-4 text-slate-400 shrink-0" />
          )}
        </span>
      </button>
    </div>
  );
}
