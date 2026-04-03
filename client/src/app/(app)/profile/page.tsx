"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
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
  Loader2,
  AtSign,
  Pencil,
  X,
} from "lucide-react";
import { truncateAddress } from "@/lib/format";
import { useApiClient } from "@/lib/api/client";
import { useSafeAddress } from "@/lib/useSafeAddress";
import { ClaimBanner } from "@/components/ClaimBanner";
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
  const [username, setUsername] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameEditing, setUsernameEditing] = useState(false);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameTaken, setUsernameTaken] = useState(false);
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const { user, wallet, getOwnerAccount, logout, telegramUserId } = useAuth();
  const { safeAddress: computedSafeAddress } = useSafeAddress(wallet?.address);
  const safeAddress = computedSafeAddress || "";
  const api = useApiClient();

  useEffect(() => {
    if (!safeAddress) return;
    api.status.get(safeAddress)
      .then((data) => setScreeningMode(data.screeningMode ?? true))
      .catch(() => {});
  }, [safeAddress, api]);

  useEffect(() => {
    if (!safeAddress) return;
    api.users.get(safeAddress)
      .then((data) => {
        const u = data?.username ?? null;
        setUsername(u);
        setUsernameInput(u ?? "");
      })
      .catch(() => {});
  }, [safeAddress, api]);

  const handleUsernameInputChange = (val: string) => {
    setUsernameInput(val);
    setUsernameError(null);
    setUsernameTaken(false);
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    if (val.trim().length >= 3) {
      setUsernameChecking(true);
      usernameDebounceRef.current = setTimeout(async () => {
        try {
          const available = await api.users.checkUsername(val.trim());
          setUsernameTaken(!available);
        } catch {
          setUsernameTaken(false);
        } finally {
          setUsernameChecking(false);
        }
      }, 400);
    } else {
      setUsernameChecking(false);
    }
  };

  const saveUsername = async () => {
    if (!safeAddress || !usernameInput.trim() || usernameTaken || usernameChecking) return;
    setUsernameSaving(true);
    setUsernameError(null);
    try {
      await api.users.upsert({ safeAddress, username: usernameInput.trim() });
      setUsername(usernameInput.trim());
      setUsernameEditing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save username";
      setUsernameError(msg.includes("taken") ? "Username already taken" : msg);
    } finally {
      setUsernameSaving(false);
    }
  };

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
    <div className="flex flex-col h-screen bg-background">
      <main className="flex-1 w-full px-4 py-5 sm:p-6 max-w-lg mx-auto overflow-y-auto pb-24 sm:pb-8">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-5"
        >
          {/* Claim Banner — always first, most prominent */}
          <motion.div variants={staggerItem}>
            <ClaimBanner
              safeAddress={safeAddress}
              telegramUserId={telegramUserId}
              username={username}
              hideWhenClaimed
            />
          </motion.div>

          {/* User Info */}
          {user && (user.email || user.name || user.image) && (
            <motion.div variants={staggerItem}>
              <div className="flex items-center gap-4 p-5 rounded-2xl bg-white/2 border border-white/6">
                {user.image ? (
                  <img
                    src={user.image}
                    alt=""
                    className="w-12 h-12 rounded-xl object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center text-lg font-semibold text-gold">
                    {(user.name || user.email || "?")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">
                    {!user.name || user.name === "" || user.name === "null"
                      ? "Signed in as"
                      : user.name}
                  </p>
                  {user.email && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {user.email}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Username Section */}
          <motion.div variants={staggerItem}>
            <div className="relative rounded-2xl overflow-hidden bg-white/6 shadow-[0_0_0_1px_rgba(240,185,11,0.12),0_12px_40px_-12px_rgba(240,185,11,0.08)]">
              <div
                className="h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(240,185,11,0.4), transparent)",
                }}
              />
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-claw/10 shadow-[0_0_10px_rgba(240,185,11,0.1)] flex items-center justify-center shrink-0">
                    <AtSign className="h-[18px] w-[18px] text-claw" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white">Username</h2>
                    <p className="text-xs text-white/40">
                      Resolves to your Zhentan address
                    </p>
                  </div>
                </div>

                {usernameEditing ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type="text"
                        value={usernameInput}
                        onChange={(e) => handleUsernameInputChange(e.target.value)}
                        placeholder="Enter username"
                        className="w-full bg-white/6 border border-white/10 rounded-xl px-3 py-2 pr-8 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-claw/50"
                        onKeyDown={(e) => { if (e.key === "Enter") saveUsername(); if (e.key === "Escape") { setUsernameEditing(false); setUsernameInput(username ?? ""); setUsernameError(null); setUsernameTaken(false); } }}
                      />
                      {usernameInput.trim().length >= 3 && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2">
                          {usernameChecking ? (
                            <Loader2 className="h-3 w-3 animate-spin text-slate-500" />
                          ) : usernameTaken ? (
                            <X className="h-3 w-3 text-red-400" />
                          ) : (
                            <Check className="h-3 w-3 text-emerald-400" />
                          )}
                        </span>
                      )}
                    </div>
                    {usernameTaken && (
                      <p className="text-xs text-red-400">Username already taken</p>
                    )}
                    {usernameError && (
                      <p className="text-xs text-red-400">{usernameError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={saveUsername}
                        disabled={usernameSaving || !usernameInput.trim() || usernameTaken || usernameChecking}
                        className="flex-1 py-2 rounded-xl bg-claw/90 text-black text-xs font-semibold disabled:opacity-50 cursor-pointer disabled:cursor-default"
                      >
                        {usernameSaving ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : "Save"}
                      </button>
                      <button
                        onClick={() => { setUsernameEditing(false); setUsernameInput(username ?? ""); setUsernameError(null); setUsernameTaken(false); }}
                        className="flex-1 py-2 rounded-xl bg-white/6 text-white/60 text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setUsernameEditing(true)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/4 border border-white/6 hover:border-claw/30 transition-colors group cursor-pointer"
                  >
                    <span className={`text-sm ${username ? "text-white" : "text-white/30"}`}>
                      {username ? `@${username}` : "Set a username"}
                    </span>
                    <Pencil className="h-3.5 w-3.5 text-white/30 group-hover:text-claw/60 transition-colors" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>

          {/* Multisig Section */}
          <motion.div variants={staggerItem}>
            <div className="p-5 rounded-2xl bg-white/2 border border-white/6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-gold/10 flex items-center justify-center shrink-0">
                  <Shield className="h-[18px] w-[18px] text-gold" />
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
              <div className="flex items-center gap-2 p-3.5 rounded-xl bg-white/4 mb-4">
                <Wallet className="h-4 w-4 text-slate-500 shrink-0" />
                <span className="font-mono text-[13px] text-slate-300 truncate min-w-0">
                  {truncateAddress(safeAddress)}
                </span>
                <div className="flex items-center gap-0.5 ml-auto shrink-0">
                  <button
                    onClick={copyAddress}
                    className="p-1.5 rounded-lg hover:bg-white/8 text-slate-500 hover:text-white transition-all cursor-pointer"
                    aria-label="Copy safe address"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-gold" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <a
                    href={`https://app.safe.global/home?safe=bnb:${safeAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-white/8 text-slate-500 hover:text-white transition-all"
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
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white/4">
                  <div className="w-10 h-10 rounded-xl bg-white/6 flex items-center justify-center shrink-0">
                    <Wallet className="h-5 w-5 text-gold" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-gold">
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
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white/4">
                  <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                    <Bot className="h-5 w-5 text-gold" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-gold">
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
                        ? truncateAddress(process.env.NEXT_PUBLIC_AGENT_ADDRESS)
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Logout */}
          <motion.div variants={staggerItem}>
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl text-sm font-medium text-slate-500 hover:text-red-400 bg-white/2 border border-white/6 hover:border-red-400/20 hover:bg-red-500/4 transition-all"
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
