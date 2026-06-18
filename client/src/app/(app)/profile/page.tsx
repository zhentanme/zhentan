"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/app/context/AuthContext";
import {
  Shield,
  Copy,
  Check,
  ExternalLink,
  LogOut,
  Loader2,
  AtSign,
  Pencil,
  X,
  Mail,
} from "lucide-react";
import { clsx } from "clsx";
import { truncateAddress } from "@/lib/format";
import { useApiClient } from "@/lib/api/client";
import { useSafeAddress } from "@/lib/useSafeAddress";
import { TwinTick } from "@/components/BrandMark";

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
  const [username, setUsername] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameEditing, setUsernameEditing] = useState(false);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameTaken, setUsernameTaken] = useState(false);
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const { user, wallet, logout } = useAuth();
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

  return (
    <div className="flex flex-col h-screen bg-background">
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 overflow-y-auto pb-24 sm:pb-10">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="min-h-full flex flex-col"
        >
          {/* Eyebrow */}
          <motion.div variants={staggerItem} className="flex items-center gap-3 mb-7">
            <span className="eyebrow text-muted-foreground">Identity</span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </motion.div>

          {/* Hero — portrait + identity */}
          <motion.section
            variants={staggerItem}
            className="grid grid-cols-[88px_1fr] sm:grid-cols-[120px_1fr] gap-6 sm:gap-8 items-start pb-8"
          >
            {/* Portrait */}
            <div className="relative">
              <div className="w-[88px] h-[88px] sm:w-[120px] sm:h-[120px] rounded-lg border border-gold/25 bg-card flex items-center justify-center overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_50px_-28px_rgba(196,148,40,0.3)]">
                {user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-5xl sm:text-6xl font-semibold text-gold-300 tracking-tight">
                    {(user?.name || user?.email || "Z").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="absolute -right-2 -bottom-2 w-8 h-8 rounded-md bg-ink-900 border border-gold/30 flex items-center justify-center">
                <TwinTick size={16} halo="none" />
              </div>
            </div>

            {/* Identity */}
            <div className="min-w-0 pt-1">
              <h1 className="text-2xl sm:text-[2rem] font-semibold text-foreground tracking-tight leading-tight truncate">
                {user?.name && user.name !== "null" && user.name !== ""
                  ? user.name
                  : "Your wallet"}
              </h1>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5 mt-6">
                {user?.email && (
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <span className="eyebrow text-muted-foreground flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </span>
                    <span className="text-[15px] text-foreground truncate">{user.email}</span>
                  </div>
                )}

                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="eyebrow text-muted-foreground flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-pill bg-safe signal-dot" />
                    Network
                  </span>
                  <span className="text-[15px] text-foreground">BNB Chain · Mainnet</span>
                </div>

                <div className="sm:col-span-2 flex flex-col gap-1.5 min-w-0">
                  <span className="eyebrow text-muted-foreground flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5" />
                    Vault address
                  </span>
                  <span className="font-mono text-sm text-foreground/90 break-all leading-relaxed">
                    {safeAddress ? truncateAddress(safeAddress, 28) : "—"}
                  </span>
                </div>
              </div>

              {/* Ghost actions */}
              <div className="flex flex-wrap gap-2 mt-6 pt-5 border-t border-dashed border-border">
                <button
                  type="button"
                  onClick={copyAddress}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs font-medium text-foreground hover:border-gold/30 hover:text-gold transition-colors cursor-pointer"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-gold" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy address"}
                </button>
                <a
                  href={`https://app.safe.global/home?safe=bnb:${safeAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs font-medium text-foreground hover:border-gold/30 hover:text-gold transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in Safe
                </a>
              </div>
            </div>
          </motion.section>

          {/* Handle (username) */}
          <motion.section variants={staggerItem} className="pt-6 border-t border-dashed border-border">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <span className="eyebrow text-muted-foreground flex items-center gap-2">
                  <AtSign className="h-3.5 w-3.5" />
                  Handle
                </span>
                <p className="text-xs text-muted-foreground/60 mt-1.5">Resolves to your Zhentan address</p>
              </div>
            </div>

            {usernameEditing ? (
              <div className="space-y-2 max-w-sm">
                <div className="relative">
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => handleUsernameInputChange(e.target.value)}
                    placeholder="Enter username"
                    className="w-full bg-foreground/6 border border-border rounded-md px-3 py-2.5 pr-8 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold/50"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveUsername();
                      if (e.key === "Escape") {
                        setUsernameEditing(false);
                        setUsernameInput(username ?? "");
                        setUsernameError(null);
                        setUsernameTaken(false);
                      }
                    }}
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
                {usernameError && <p className="text-[11px] text-danger">{usernameError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={saveUsername}
                    disabled={usernameSaving || !usernameInput.trim() || usernameTaken || usernameChecking || username === usernameInput.trim()}
                    className="flex-1 py-2 rounded-md bg-gradient-to-br from-gold-light to-gold-500 text-ink-900 text-xs font-semibold disabled:opacity-50 cursor-pointer disabled:cursor-default"
                  >
                    {usernameSaving ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : "Save"}
                  </button>
                  <button
                    onClick={() => {
                      setUsernameEditing(false);
                      setUsernameInput(username ?? "");
                      setUsernameError(null);
                      setUsernameTaken(false);
                    }}
                    className="flex-1 py-2 rounded-md bg-foreground/6 text-muted-foreground text-xs cursor-pointer hover:bg-foreground/10 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setUsernameEditing(true)}
                className="group inline-flex items-center gap-3"
              >
                <span
                  className={clsx(
                    "font-mono text-base",
                    username ? "text-foreground" : "text-muted-foreground/50"
                  )}
                >
                  {username ? `@${username}` : "Set a username"}
                </span>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-gold transition-colors" />
              </button>
            )}
          </motion.section>

          <div className="flex-1 min-h-8" />

          {/* Logout — split row */}
          <motion.section
            variants={staggerItem}
            className="mt-8 pt-6 border-t border-dashed border-border flex items-center justify-between gap-6"
          >
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">Sign out of Zhentan</p>
              <p className="text-[13px] text-muted-foreground/70 mt-0.5">
                Your co-signer goes quiet until you return.
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
              className="inline-flex items-center gap-2 py-2.5 px-4 rounded-md text-[13px] font-semibold text-foreground border border-border hover:text-danger hover:border-danger/35 hover:bg-danger/[0.04] transition-colors shrink-0 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </motion.section>
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
