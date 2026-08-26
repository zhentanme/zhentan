"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { clsx } from "clsx";
import { truncateAddress } from "@/lib/format";

interface AddressProps {
  address: string;
  /** Show the full untruncated address (e.g. receive screens). */
  full?: boolean;
  /** Show a copy button with check feedback. */
  copy?: boolean;
  /** Link the address to BscScan. */
  explorer?: boolean;
  className?: string;
}

export const COPY_FEEDBACK_MS = 2000;

/** Canonical address display: `0x1234…abcd`, mono, optional copy/explorer. */
export function Address({ address, full, copy, explorer, className }: AddressProps) {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };

  const text = full ? address : truncateAddress(address);

  return (
    <span className={clsx("inline-flex items-center gap-1.5 font-mono min-w-0", className)}>
      {explorer ? (
        <a
          href={`https://bscscan.com/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className={clsx("hover:text-gold transition-colors inline-flex items-center gap-1", full && "break-all")}
        >
          <span className={full ? "break-all" : "truncate"}>{text}</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
        </a>
      ) : (
        <span className={full ? "break-all" : "truncate"}>{text}</span>
      )}
      {copy && (
        <button
          type="button"
          aria-label="Copy address"
          onClick={copyAddress}
          className="shrink-0 p-1 rounded-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-safe" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </span>
  );
}
