"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Loader2, Wallet } from "lucide-react";
import { useConnectWallet } from "@privy-io/react-auth";
import { getAddress, isAddress } from "viem";

import { useAuth } from "@/app/context/AuthContext";
import { useApiClient } from "@/lib/api/client";

/**
 * Signature-free backup-key (owner #2) selection. Three ways in:
 *   1. Connect a wallet — Privy connect modal, eth_requestAccounts only.
 *      No SIWE, no account linking, so the same hardware/backup wallet can
 *      serve any number of Zhentan accounts.
 *   2. Paste an address.
 *   3. Enter an ENS (.eth) or SPACE ID (.bnb) name — resolved server-side.
 *
 * The backup key never signs during setup (it's the override key used at
 * app.safe.global), so ownership is confirmed by the user, not a signature.
 * A preview + explicit confirm guards against typos: the chosen address is
 * baked into the Safe's derivation and can't be casually swapped later.
 */
export function BackupAddressPicker({
  onSelect,
  compact = false,
}: {
  /** Called with the checksummed address once the user confirms it. */
  onSelect: (address: string) => void;
  /** Tighter spacing for inline embeds (e.g. the upgrade banner). */
  compact?: boolean;
}) {
  const { wallet } = useAuth();
  const api = useApiClient();

  const [input, setInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Resolved-but-unconfirmed candidate shown in the preview row. */
  const [candidate, setCandidate] = useState<{ address: string; label?: string } | null>(null);

  const agentAddress = process.env.NEXT_PUBLIC_AGENT_ADDRESS;

  const validate = (address: string): string | null => {
    if (wallet?.address && address.toLowerCase() === wallet.address.toLowerCase()) {
      return "That's your Zhentan account key — the backup must be a different wallet.";
    }
    if (agentAddress && address.toLowerCase() === agentAddress.toLowerCase()) {
      return "That's the Zhentan agent's address — pick a wallet you control.";
    }
    return null;
  };

  const propose = (address: string, label?: string) => {
    const checksummed = getAddress(address as `0x${string}`);
    const invalid = validate(checksummed);
    if (invalid) {
      setError(invalid);
      setCandidate(null);
      return;
    }
    setError(null);
    setCandidate({ address: checksummed, label });
  };

  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet: connected }) => {
      setConnecting(false);
      if (connected?.address) propose(connected.address, "Connected wallet");
    },
    onError: () => setConnecting(false),
  });

  const handleResolve = async () => {
    const value = input.trim();
    if (!value) return;
    setError(null);
    setCandidate(null);

    if (value.startsWith("0x")) {
      if (!isAddress(value)) {
        setError("That doesn't look like a valid address.");
        return;
      }
      propose(value);
      return;
    }

    if (!value.includes(".")) {
      setError("Enter a 0x address, or a .eth / .bnb name.");
      return;
    }

    setResolving(true);
    try {
      const result = await api.resolve.resolve(value);
      // Zhentan usernames resolve to a Safe (a contract) — not a signer key.
      if (result.source === "zhentan") {
        setError("Zhentan usernames point to a vault, not a wallet — use a .eth/.bnb name or an address.");
        return;
      }
      if (!isAddress(result.address)) {
        setError("Name resolved to an invalid address.");
        return;
      }
      propose(result.address, value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve that name.");
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className={compact ? "space-y-2.5" : "space-y-3"}>
      {/* Option 1: connect (no signature) */}
      <button
        onClick={() => {
          setError(null);
          setConnecting(true);
          try {
            connectWallet();
          } catch {
            setConnecting(false);
          }
        }}
        disabled={connecting}
        className="w-full flex items-center gap-3 rounded-xl px-4 py-3 border border-foreground/8 bg-foreground/4 hover:bg-foreground/6 hover:border-foreground/12 transition-all duration-200 disabled:opacity-60 disabled:cursor-default"
      >
        <div className="w-8 h-8 rounded-lg bg-foreground/6 flex items-center justify-center shrink-0">
          {connecting
            ? <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
            : <Wallet className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-foreground">Connect a wallet</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {connecting ? "Opening wallet..." : "Read-only — no signature asked"}
          </p>
        </div>
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" aria-hidden />
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">or</span>
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>

      {/* Option 2/3: paste address or name */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
            setCandidate(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleResolve();
          }}
          placeholder="0x address, name.eth or name.bnb"
          spellCheck={false}
          autoComplete="off"
          className="flex-1 min-w-0 bg-foreground/6 border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:font-sans placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold/50"
        />
        <button
          onClick={handleResolve}
          disabled={resolving || !input.trim()}
          className="shrink-0 px-3.5 py-2 rounded-md border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/10 transition-colors disabled:opacity-50 disabled:cursor-default"
        >
          {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Use"}
        </button>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-danger">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      {/* Preview + explicit confirm */}
      <AnimatePresence>
        {candidate && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-xl border border-gold/25 bg-gold/[0.06] p-3.5 space-y-2.5"
          >
            <div className="min-w-0">
              {candidate.label && (
                <p className="text-xs font-semibold text-foreground">{candidate.label}</p>
              )}
              <p className="text-[11px] font-mono text-muted-foreground break-all">
                {candidate.address}
              </p>
            </div>
            <p className="text-[11px] text-watch/90 leading-relaxed">
              Make sure you control this wallet. It becomes an owner of your
              vault and is your override key — it can&apos;t be casually changed
              later. Zhentan never asks it to sign during setup.
            </p>
            <button
              onClick={() => onSelect(candidate.address)}
              className="w-full flex items-center justify-center gap-2 rounded-md py-2 bg-gold text-ink-900 text-xs font-semibold hover:bg-gold/90 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
              Use as my backup key
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
