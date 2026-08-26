"use client";

import { useState } from "react";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, ArrowDownLeft } from "lucide-react";

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
      <div className="w-12 h-12 rounded-md bg-foreground/8 flex items-center justify-center text-gold">
        <ArrowDownLeft className="h-5 w-5" />
      </div>
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/80">
        <Image src="/bsc-yellow.png" alt="" width={16} height={16} className="object-contain" />
        Deposit any asset on BNB Chain
      </p>

      <div className="p-4 sm:p-5 bg-ink-0 rounded-md shadow-[0_8px_32px_-8px_rgba(0,0,0,0.2)] inline-flex">
        <QRCodeSVG value={safeAddress} size={148} />
      </div>

      <button
        type="button"
        onClick={copyAddress}
        className="w-full rounded-md bg-foreground/6 hover:bg-foreground/10 transition-colors px-3 py-3 text-left min-h-11 touch-manipulation cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs sm:text-sm text-foreground/80 break-all">
            {safeAddress}
          </span>
          {copied ? (
            <Check className="h-4 w-4 text-safe shrink-0" />
          ) : (
            <Copy className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </span>
      </button>
    </div>
  );
}
