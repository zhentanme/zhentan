"use client";

import { Wallet } from "lucide-react";
import { clsx } from "clsx";

import type { SignerWalletMeta } from "@/app/context/AuthContext";

/** Local brand assets for wallets whose EIP-6963 icon may be missing. */
const LOCAL_ICONS: Record<string, string> = {
  metamask: "/metamask.webp",
  rabby_wallet: "/rabby.png",
  rabby: "/rabby.png",
};

/**
 * Logo of the connected signing wallet. Prefers the icon the wallet reports
 * about itself (EIP-6963, via Privy — usually a data URI), then our local
 * MetaMask/Rabby assets by client type, then a generic wallet glyph.
 */
export function WalletBrandIcon({
  meta,
  className,
}: {
  meta: SignerWalletMeta | null;
  className?: string;
}) {
  const src = meta?.icon ?? (meta ? LOCAL_ICONS[meta.clientType] : undefined);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data URIs from EIP-6963
      <img
        src={src}
        alt={meta?.name ?? ""}
        className={clsx("rounded-[3px] object-contain shrink-0", className)}
      />
    );
  }
  return <Wallet className={clsx("text-muted-foreground shrink-0", className)} />;
}
