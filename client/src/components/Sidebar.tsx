"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, ShieldOff, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/BrandMark";
import { AccountDialog } from "@/components/AccountDialog";
import { navItems } from "@/components/TopBar";
import { useAuth } from "@/app/context/AuthContext";
import { useScreeningStatus } from "@/app/context/ScreeningStatusContext";
import { useActivityData } from "@/app/context/ActivityDataContext";
import { truncateAddress } from "@/lib/format";

export function Sidebar() {
  const pathname = usePathname();
  const { safeAddress, user } = useAuth();
  const { isScreeningActive } = useScreeningStatus();
  const { queuedCount } = useActivityData();
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden lg:flex w-64 flex-col border-r border-border bg-card/30 backdrop-blur-xl">
      {/* Brand */}
      <div className="px-6 h-16 flex items-center">
        <BrandMark href="/home" size="md" halo="#0a0d0e" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-4">
        <p className="eyebrow text-muted-foreground/70 px-3 mb-2">Navigate</p>
        <div className="space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-tour={item.tour}
                className={clsx(
                  "group relative flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-gold/10 text-gold"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active"
                    className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-pill bg-gold"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.badge && queuedCount > 0 && (
                  <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-pill bg-gold text-[10px] font-bold text-ink-900 leading-none">
                    {queuedCount > 99 ? "99+" : queuedCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Screening status */}
      <div className="px-3">
        <div
          className={clsx(
            "flex items-center gap-2 px-3 py-2.5 rounded-md text-xs font-mono uppercase tracking-wider",
            isScreeningActive ? "bg-safe/10 text-safe" : "bg-foreground/5 text-muted-foreground"
          )}
        >
          {isScreeningActive ? (
            <Shield className="h-3.5 w-3.5" />
          ) : (
            <ShieldOff className="h-3.5 w-3.5" />
          )}
          <span className="flex-1">Screening</span>
          <span className="font-semibold">{isScreeningActive ? "On" : "Off"}</span>
        </div>
      </div>

      {/* Account — opens the account dialog (identity, address, log out) */}
      <div className="p-3 mt-2 border-t border-border">
        <button
          type="button"
          onClick={() => setAccountOpen(true)}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-foreground/5 transition-colors cursor-pointer text-left"
        >
          <div className="h-9 w-9 rounded-pill bg-gradient-to-br from-gold-light to-gold-500 flex items-center justify-center text-ink-900 font-bold text-sm shrink-0">
            {(user?.name || user?.email || "Z").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.name || user?.email?.split("@")[0] || "Account"}
            </p>
            {safeAddress && (
              <p className="text-[11px] font-mono text-muted-foreground truncate">
                {truncateAddress(safeAddress, 13)}
              </p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
        </button>
      </div>

      <AccountDialog open={accountOpen} onClose={() => setAccountOpen(false)} />
    </aside>
  );
}
