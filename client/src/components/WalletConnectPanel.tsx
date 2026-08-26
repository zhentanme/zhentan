"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { IconButton } from "./ui/IconButton";
import { InlineError } from "./ui/InlineError";
import { EmptyState } from "./ui/EmptyState";
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
      setError("Couldn’t connect. Check the URI and try again.");
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
      <EmptyState
        icon={Plug}
        title="Starting WalletConnect…"
        hint="If this doesn’t finish, WalletConnect isn’t configured for this deployment"
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Pair input */}
      <div className="flex flex-col gap-3">
        <label className="text-sm font-medium text-foreground/80">
          Connect to dApp
        </label>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              type="text"
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              placeholder="Paste WalletConnect URI (wc:…)"
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            />
          </div>
          <Button
            onClick={handleConnect}
            loading={pairing}
            disabled={!uri.trim()}
            aria-label="Connect"
            className="px-4 shrink-0"
          >
            <Plug className="h-4 w-4" />
          </Button>
        </div>
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
            >
              <InlineError>{error}</InlineError>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Active sessions */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Active sessions ({sessionEntries.length})
        </h3>
        {sessionEntries.length === 0 ? (
          <EmptyState compact title="No connected dApps" />
        ) : (
          <div className="flex flex-col gap-2">
            {sessionEntries.map(([topic, session]) => {
              const peer = (session as unknown as { peer?: { metadata?: { name?: string; url?: string; icons?: string[] } } })?.peer?.metadata;
              const name = peer?.name || "Unknown dApp";
              const url = peer?.url || "";
              const icon = peer?.icons?.[0];

              return (
                <motion.div
                  key={topic}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-center gap-3 rounded-md bg-foreground/4 border border-foreground/6 px-4 py-3"
                >
                  {icon ? (
                    <img
                      src={icon}
                      alt=""
                      className="w-8 h-8 rounded-sm bg-foreground/10 shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-sm bg-foreground/10 flex items-center justify-center shrink-0">
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{name}</p>
                    {url && (
                      <p className="text-xs text-muted-foreground/80 truncate">{url}</p>
                    )}
                  </div>
                  <IconButton
                    tone="danger"
                    label="Disconnect"
                    onClick={() => handleDisconnect(topic)}
                    className="shrink-0"
                  >
                    <Unplug className="h-4 w-4" />
                  </IconButton>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
