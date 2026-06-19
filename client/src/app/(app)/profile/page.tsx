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
  Pencil,
  X,
  Mail,
} from "lucide-react";
import { clsx } from "clsx";
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

  const displayName =
    user?.name && user.name !== "null" && user.name !== "" ? user.name : "Your wallet";

  return (
    <div className="flex flex-col h-screen bg-background">
      <main className="flex-1 w-full px-4 sm:px-8 lg:px-10 py-6 sm:py-8 overflow-y-auto pb-24 sm:pb-10">
        <motion.div variants={staggerContainer} initial="hidden" animate="visible">
          {/* Eyebrow */}
          <motion.div variants={staggerItem} className="flex items-center gap-3 mb-7">
            <span className="eyebrow text-muted-foreground">Profile</span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </motion.div>

          {/* Hero card */}
          <motion.section
            variants={staggerItem}
            className="grid grid-cols-[auto_1fr] gap-6 sm:gap-7 items-center p-6 sm:p-7 rounded-3xl bg-card shadow-[0_20px_50px_-38px_rgba(0,0,0,0.7)]"
          >
            {/* Portrait */}
            <div className="relative shrink-0">
              <div className="w-[88px] h-[88px] sm:w-[104px] sm:h-[104px] rounded-[26px] border border-gold/25 bg-ink-950 flex items-center justify-center overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_40px_-24px_rgba(196,148,40,0.45)]">
                {user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-5xl font-semibold text-gold-300 tracking-tight">
                    {(user?.name || user?.email || "Z").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="absolute -right-1.5 -bottom-1.5 w-8 h-8 rounded-[14px] bg-ink-900 border border-gold/30 flex items-center justify-center">
                <TwinTick size={16} halo="none" />
              </div>
            </div>

            {/* Identity */}
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight leading-tight truncate">
                {displayName}
              </h1>

              {/* Handle + verified (editable) */}
              {usernameEditing ? (
                <div className="mt-3 max-w-xs">
                  <div className="relative">
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={(e) => handleUsernameInputChange(e.target.value)}
                      placeholder="Enter username"
                      autoFocus
                      className="w-full bg-foreground/6 border border-border rounded-md px-3 py-2 pr-8 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold/50"
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
                  {usernameError && <p className="mt-1.5 text-[11px] text-danger">{usernameError}</p>}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={saveUsername}
                      disabled={usernameSaving || !usernameInput.trim() || usernameTaken || usernameChecking || username === usernameInput.trim()}
                      className="flex-1 py-1.5 rounded-md bg-gradient-to-br from-gold-light to-gold-500 text-ink-900 text-xs font-semibold disabled:opacity-50 cursor-pointer disabled:cursor-default"
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
                      className="flex-1 py-1.5 rounded-md bg-foreground/6 text-muted-foreground text-xs cursor-pointer hover:bg-foreground/10 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2.5 mt-3">
                  <button
                    onClick={() => setUsernameEditing(true)}
                    className="group inline-flex items-center gap-2"
                  >
                    <span
                      className={clsx(
                        "font-mono text-[13px]",
                        username ? "text-foreground/85" : "text-muted-foreground/50"
                      )}
                    >
                      {username ? `@${username}` : "Set a username"}
                    </span>
                    <Pencil className="h-3 w-3 text-muted-foreground/40 group-hover:text-gold transition-colors" />
                  </button>
                  {username && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-safe/12 text-safe font-mono uppercase tracking-wider text-[10px] font-semibold">
                      <Check className="h-2.5 w-2.5" />
                      Verified
                    </span>
                  )}
                </div>
              )}

              {/* Email */}
              {user?.email && (
                <div className="flex items-center gap-2 mt-3 text-sm text-foreground/90 min-w-0">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{user.email}</span>
                </div>
              )}

              {/* Ghost actions */}
              <div className="flex flex-wrap gap-2 mt-5">
                <button
                  type="button"
                  onClick={copyAddress}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-border bg-foreground/[0.02] text-[13px] font-medium text-foreground hover:border-gold/30 hover:text-gold transition-colors cursor-pointer"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-gold" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy address"}
                </button>
                <a
                  href={`https://app.safe.global/home?safe=bnb:${safeAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-border bg-foreground/[0.02] text-[13px] font-medium text-foreground hover:border-gold/30 hover:text-gold transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in Safe
                </a>
              </div>
            </div>
          </motion.section>

          {/* Vault address */}
          <motion.section
            variants={staggerItem}
            className="flex items-center justify-between gap-4 flex-wrap mt-6 pt-6 border-t border-dashed border-border"
          >
            <div className="min-w-0">
              <span className="eyebrow text-muted-foreground flex items-center gap-2">
                <Shield className="h-3.5 w-3.5" />
                Vault address
              </span>
              <p className="font-mono text-sm text-foreground/90 break-all mt-2.5">
                {safeAddress || "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={copyAddress}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-medium text-muted-foreground hover:border-gold/30 hover:text-gold transition-colors cursor-pointer"
            >
              {copied ? <Check className="h-3 w-3 text-gold" /> : <Copy className="h-3 w-3" />}
              Copy
            </button>
          </motion.section>

          {/* Logout — split row */}
          <motion.section
            variants={staggerItem}
            className="mt-8 pt-6 border-t border-dashed border-border flex items-center justify-between gap-6 flex-wrap"
          >
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">Sign out of Zhentan</p>
              <p className="text-[13px] text-muted-foreground/70 mt-1">
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
