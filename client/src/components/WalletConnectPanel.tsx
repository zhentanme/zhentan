"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/Button";
import { useWalletConnect } from "@/app/context/WalletConnectContext";
import { Plug, Unplug, ExternalLink } from "lucide-react";
import { truncateAddress } from "@/lib/format";

export function WalletConnectPanel() {
  const { ready, pair, sessions, disconnectSession } = useWalletConnect();
  const [uri, setUri] = useState("");
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionEntries = Object.entries(sessions);

  const handleConnect = async () => {
    if (!uri.trim()) return;
    setError(null);
    setPairing(true);
    try {
      await pair(uri.trim());
      setUri("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pair");
    } finally {
      setPairing(false);
    }
  };

  const handleDisconnect = async (topic: string) => {
    try {
      await disconnectSession(topic);
    } catch (err) {
      console.error("Disconnect failed:", err);
    }
  };

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-sm">
        <Plug className="h-8 w-8 mb-3 opacity-50" />
        <p>WalletConnect initializing...</p>
        <p className="text-xs text-slate-500 mt-1">
          Ensure NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Pair input */}
      <div className="flex flex-col gap-3">
        <label className="text-sm font-medium text-slate-300">
          Connect to DApp
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="Paste WalletConnect URI (wc:...)"
            className="flex-1 rounded-xl bg-white/6 border border-white/[0.08] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-gold/50 transition-all"
            onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          />
          <Button
            onClick={handleConnect}
            loading={pairing}
            disabled={!uri.trim()}
            className="px-4 shrink-0"
          >
            <Plug className="h-4 w-4" />
          </Button>
        </div>
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-xs text-red-400"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Active sessions */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-slate-400">
          Active Sessions ({sessionEntries.length})
        </h3>
        {sessionEntries.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No connected DApps. Paste a WalletConnect URI above to connect.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessionEntries.map(([topic, session]) => {
              const peer = (session as unknown as { peer?: { metadata?: { name?: string; url?: string; icons?: string[] } } })?.peer?.metadata;
              const name = peer?.name || "Unknown DApp";
              const url = peer?.url || "";
              const icon = peer?.icons?.[0];

              return (
                <motion.div
                  key={topic}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-center gap-3 rounded-xl bg-white/4 border border-white/6 px-4 py-3"
                >
                  {icon ? (
                    <img
                      src={icon}
                      alt=""
                      className="w-8 h-8 rounded-lg bg-white/10 shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <ExternalLink className="h-4 w-4 text-slate-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{name}</p>
                    {url && (
                      <p className="text-xs text-slate-500 truncate">{url}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDisconnect(topic)}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                    aria-label="Disconnect"
                  >
                    <Unplug className="h-4 w-4" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
