"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/app/context/AuthContext";
import {
  Wallet,
  Shield,
  Copy,
  Check,
  ExternalLink,
  LogOut,
  Bot,
} from "lucide-react";
import { truncateAddress } from "@/lib/format";
import { useApiClient } from "@/lib/api/client";
import { useSafeAddress } from "@/lib/useSafeAddress";
import { toHex } from "viem";

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, type: "spring" as const, bounce: 0.15 },
  },
};

function ProfilePageContent() {
  const [screeningMode, setScreeningMode] = useState(true);
  const [copied, setCopied] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signResult, setSignResult] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const router = useRouter();
  const { user, wallet, getOwnerAccount, logout } = useAuth();
  const { safeAddress: computedSafeAddress } = useSafeAddress(wallet?.address);
  const safeAddress = computedSafeAddress || "";
  const api = useApiClient();

  useEffect(() => {
    if (!safeAddress) return;
    api.status.get(safeAddress)
      .then((data) => setScreeningMode(data.screeningMode ?? true))
      .catch(() => {});
  }, [safeAddress, api]);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(safeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSign = async () => {
    if (!wallet) return;

    setSigning(true);
    setSignResult(null);
    setSignError(null);

    try {
      const account = await getOwnerAccount();
      if (!account) throw new Error("Wallet not ready");

      const sig = await account.signMessage({
        message: { raw: toHex("Zhentan signing test") },
      });
      setSignResult(sig);
    } catch (err) {
      setSignError(err instanceof Error ? err.message : "Signing failed");
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen cosmic-bg starfield">
      <TopBar screeningMode={screeningMode} />
      <main className="flex-1 w-full px-4 py-5 sm:p-6 md:p-8 max-w-4xl mx-auto overflow-y-auto">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-5"
        >
          {/* User Info */}
          {user && (user.email || user.name || user.image) && (
            <motion.div variants={staggerItem}>
              <div className="relative rounded-2xl overflow-hidden bg-white/[0.06] shadow-[0_0_0_1px_rgba(240,185,11,0.12),0_12px_40px_-12px_rgba(240,185,11,0.08)]">
                <div
                  className="h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(240,185,11,0.4), transparent)",
                  }}
                />
                <div className="p-5">
                  <div className="flex items-center gap-4">
                    {user.image ? (
                      <img
                        src={user.image}
                        alt=""
                        className="w-12 h-12 rounded-2xl object-cover shadow-[0_0_0_1px_rgba(240,185,11,0.15)]"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-claw/10 shadow-[0_0_12px_rgba(240,185,11,0.15)] flex items-center justify-center text-lg font-semibold text-claw">
                        {(user.name || user.email || "?")
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">
                        {!user.name ||
                        user.name == "" ||
                        user.name == "null"
                          ? "Signed in as"
                          : `${user.name}`}
                      </p>
                      {user.email && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {user.email}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Multisig Section */}
          <motion.div variants={staggerItem}>
            <div className="relative rounded-2xl overflow-hidden bg-white/[0.06] shadow-[0_0_0_1px_rgba(240,185,11,0.12),0_12px_40px_-12px_rgba(240,185,11,0.08)]">
              <div
                className="h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(240,185,11,0.4), transparent)",
                }}
              />
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-claw/10 shadow-[0_0_10px_rgba(240,185,11,0.1)] flex items-center justify-center flex-shrink-0">
                    <Shield className="h-[18px] w-[18px] text-claw" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      Multisig Config
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      2-of-2 treasury wallet
                    </p>
                  </div>
                </div>

                {/* Safe Address */}
                <div className="flex items-center gap-2 p-3.5 rounded-xl bg-white/[0.04] shadow-[0_0_0_1px_rgba(255,255,255,0.04)] mb-4">
                  <Wallet className="h-4 w-4 text-slate-500 flex-shrink-0" />
                  <span className="font-mono text-[13px] text-slate-300 truncate min-w-0">
                    {truncateAddress(safeAddress)}
                  </span>
                  <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
                    <button
                      onClick={copyAddress}
                      className="p-1.5 rounded-lg hover:bg-white/[0.08] text-slate-500 hover:text-white transition-all"
                      aria-label="Copy safe address"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-claw" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <a
                      href={`https://app.safe.global/home?safe=bnb:${safeAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-white/[0.08] text-slate-500 hover:text-white transition-all"
                      aria-label="Open in Safe"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>

                {/* Signers */}
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-3 px-1">
                  Signers
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.04] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                      <Wallet className="h-5 w-5 text-claw" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-claw">
                        Signer 1
                      </p>
                      <p className="text-[11px] text-slate-500 mb-0.5">
                        Privy embedded wallet
                      </p>
                      <p
                        className="font-mono text-[11px] text-slate-300 truncate"
                        title={wallet?.address}
                      >
                        {wallet?.address
                          ? truncateAddress(wallet.address)
                          : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.04] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
                    <div className="w-10 h-10 rounded-xl bg-claw/10 shadow-[0_0_10px_rgba(240,185,11,0.1)] flex items-center justify-center flex-shrink-0">
                      <Bot className="h-5 w-5 text-claw" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-claw">
                        Signer 2
                      </p>
                      <p className="text-[11px] text-slate-500 mb-0.5">
                        Agent
                      </p>
                      <p
                        className="font-mono text-[11px] text-slate-300 truncate"
                        title={process.env.NEXT_PUBLIC_AGENT_ADDRESS}
                      >
                        {process.env.NEXT_PUBLIC_AGENT_ADDRESS
                          ? truncateAddress(
                              process.env.NEXT_PUBLIC_AGENT_ADDRESS
                            )
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Logout */}
          <motion.div variants={staggerItem}>
            <button
              type="button"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-sm font-medium text-slate-500 hover:text-red-400 bg-white/[0.03] hover:bg-red-500/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.04)] hover:shadow-[0_0_0_1px_rgba(239,68,68,0.15)] transition-all"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfilePageContent />
    </AuthGuard>
  );
}
