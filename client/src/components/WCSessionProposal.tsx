"use client";

import { motion } from "framer-motion";
import { Button } from "./ui/Button";
import { useWalletConnect } from "@/app/context/WalletConnectContext";
import { Dialog } from "./ui/Dialog";
import { Shield, ExternalLink } from "lucide-react";

export function WCSessionProposal() {
  const { sessionProposal, approveSession, rejectSession } = useWalletConnect();

  if (!sessionProposal) return null;

  const peer = sessionProposal.params.proposer.metadata;
  const name = peer.name || "Unknown DApp";
  const url = peer.url || "";
  const icon = peer.icons?.[0];
  const description = peer.description || "";

  // Extract requested chains and methods
  const requiredNamespaces = sessionProposal.params.requiredNamespaces;
  const eip155 = requiredNamespaces?.eip155;
  const chains = eip155?.chains || [];
  const methods = eip155?.methods || [];

  return (
    <Dialog open onClose={rejectSession} title="Connection Request">
      <div className="flex flex-col items-center gap-5 py-2">
        {/* DApp info */}
        <div className="flex flex-col items-center gap-3">
          {icon ? (
            <img
              src={icon}
              alt=""
              className="w-16 h-16 rounded-2xl bg-white/10"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
              <ExternalLink className="h-8 w-8 text-slate-400" />
            </div>
          )}
          <div className="text-center">
            <h3 className="text-lg font-semibold text-white">{name}</h3>
            {url && (
              <p className="text-sm text-slate-400 mt-0.5">{url}</p>
            )}
            {description && (
              <p className="text-xs text-slate-500 mt-1 max-w-[280px]">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Security note */}
        <div className="flex items-start gap-3 rounded-xl bg-gold/[0.08] border border-gold/20 px-4 py-3 w-full">
          <Shield className="h-5 w-5 text-gold shrink-0 mt-0.5" />
          <p className="text-xs text-slate-300 leading-relaxed">
            Transactions from this DApp will be screened by your AI agent before execution.
          </p>
        </div>

        {/* Requested permissions */}
        {(chains.length > 0 || methods.length > 0) && (
          <div className="w-full rounded-xl bg-white/3 border border-white/6 px-4 py-3">
            <p className="text-xs font-medium text-slate-400 mb-2">Requested permissions</p>
            {chains.length > 0 && (
              <p className="text-xs text-slate-500">
                Chains: {chains.join(", ")}
              </p>
            )}
            {methods.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                Methods: {methods.slice(0, 4).join(", ")}
                {methods.length > 4 && ` +${methods.length - 4} more`}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <motion.div
          className="flex gap-3 w-full pt-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Button
            variant="secondary"
            onClick={rejectSession}
            className="flex-1"
          >
            Reject
          </Button>
          <Button onClick={approveSession} className="flex-1">
            Connect
          </Button>
        </motion.div>
      </div>
    </Dialog>
  );
}
