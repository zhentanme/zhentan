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
      .catch(() => { });
  }, [safeAddress, api]);

  useEffect(() => {
    if (!safeAddress) return;
    api.users.get(safeAddress)
      .then((data) => {
        const u = data?.username ?? null;
        setUsername(u);
        setUsernameInput(u ?? "");
      })
      .catch(() => { });
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
          className="space-y-5 h-full flex flex-col justify-between items-center"
        >
         <div className="space-y-5 w-full">
           {/* Claim Banner — always first, most prominent */}
           {/* <motion.div variants={staggerItem}>
            <ClaimBanner
              safeAddress={safeAddress}
              telegramUserId={telegramUserId}
              username={username}
              hideWhenClaimed
              className="mx-0"
            />
          </motion.div> */}

          {/* User Info */}
          {user && (user.email || user.name || user.image) && (
            <motion.div variants={staggerItem}>
              <div className="flex flex-col items-center gap-4 p-5">
                {user.image ? (
                  <img
                    src={user.image}
                    alt=""
                    className="w-14 h-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center text-lg font-semibold text-gold">
                    {(user.name || user.email || "?")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {!user.name || user.name === "" || user.name === "null"
                      ? "Signed in as"
                      : user.name}
                  </p>
                  {user.email && (
                    <p className="text-xs text-muted-foreground/80 truncate mt-0.5">
                      {user.email}
                    </p>
                  )}
                  {/* Safe Address */}
                  <div className="flex items-center gap-2">
                    <Wallet className="h-3.5 w-3.5 text-muted-foreground/80 shrink-0 invisible" />
                    <Wallet className="h-3.5 w-3.5 text-muted-foreground/80 shrink-0" />
                    <span className="font-mono text-xs text-foreground/80 truncate min-w-0">
                      {truncateAddress(safeAddress)}
                    </span>
                    <div className="flex items-center gap-0.5 ml-auto shrink-0">
                      <button
                        onClick={copyAddress}
                        className="p-1.5 rounded-lg hover:bg-foreground/8 text-muted-foreground/80 hover:text-foreground transition-all cursor-pointer"
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
                        className="p-1.5 rounded-lg hover:bg-foreground/8 text-muted-foreground/80 hover:text-foreground transition-all"
                        aria-label="Open in Safe"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Username Section */}
          <motion.div variants={staggerItem}>
            <div className="relative rounded-2xl overflow-hidden bg-foreground/6 shadow-[0_0_0_1px_rgba(196,148,40,0.12),0_12px_40px_-12px_rgba(196,148,40,0.08)]">
              <div
                className="h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(196,148,40,0.4), transparent)",
                }}
              />
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-claw/10 shadow-[0_0_10px_rgba(196,148,40,0.1)] flex items-center justify-center shrink-0">
                    <AtSign className="h-[18px] w-[18px] text-claw" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Username</h2>
                    <p className="text-xs text-foreground/40">
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
                        className="w-full bg-foreground/6 border border-foreground/10 rounded-xl px-3 py-2 pr-8 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-claw/50"
                        onKeyDown={(e) => { if (e.key === "Enter") saveUsername(); if (e.key === "Escape") { setUsernameEditing(false); setUsernameInput(username ?? ""); setUsernameError(null); setUsernameTaken(false); } }}
                      />
                      {usernameInput.trim().length >= 3 && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2">
                          {usernameChecking ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/80" />
                          ) : usernameTaken ? (
                            <X className="h-3.5 w-3.5 text-danger" />
                          ) : (
                            <Check className="h-3.5 w-3.5 text-safe" />
                          )}
                        </span>
                      )}
                    </div>
                   
                    <div className="flex gap-2">
                      <button
                        onClick={saveUsername}
                        disabled={usernameSaving || !usernameInput.trim() || usernameTaken || usernameChecking || username === usernameInput.trim()}
                        className="flex-1 py-2 rounded-xl bg-claw/90 text-black text-xs font-semibold disabled:opacity-50 cursor-pointer disabled:cursor-default"
                      >
                        {usernameSaving ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : "Save"}
                      </button>
                      <button
                        onClick={() => { setUsernameEditing(false); setUsernameInput(username ?? ""); setUsernameError(null); setUsernameTaken(false); }}
                        className="flex-1 py-2 rounded-xl bg-foreground/6 text-foreground/60 text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setUsernameEditing(true)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors group cursor-pointer"
                  >
                    <span className={`text-sm ${username ? "text-foreground" : "text-foreground/30"}`}>
                      {username ? `@${username}` : "Set a username"}
                    </span>
                    <Pencil className="h-3.5 w-3.5 text-foreground/30 group-hover:text-claw/60 transition-colors" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
         </div>

      

          {/* Logout */}
          <motion.div className="w-full" variants={staggerItem}>
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl text-sm font-medium text-danger bg-foreground/2 border border-foreground/6 hover:border-danger/20 hover:bg-danger/4 transition-all"
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
