"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useApiClient } from "@/lib/api/client";
import { useAuth } from "@/app/context/AuthContext";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Settings, User, Bell, Shield, ShieldOff } from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { href: "/app", label: "Home", icon: LayoutDashboard },
  { href: "/requests", label: "Requests", icon: Bell, badge: true },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/profile", label: "Profile", icon: User },
];

interface TopBarProps {
  screeningMode: boolean;
}

export function TopBar({ screeningMode }: TopBarProps) {
  const pathname = usePathname();
  const [queuedCount, setQueuedCount] = useState(0);
  const api = useApiClient();

  const fetchQueuedCount = useCallback(async () => {
    try {
      const data = await api.invoices.list();
      const count = (data.invoices || []).filter(
        (inv: { status: string }) => inv.status === "queued"
      ).length;
      setQueuedCount(count);
    } catch {
      // silent
    }
  }, [api]);

  useEffect(() => {
    fetchQueuedCount();
    const interval = setInterval(fetchQueuedCount, 30_000);
    return () => clearInterval(interval);
  }, [fetchQueuedCount]);

  return (
    <>
      {/* Mobile top bar — minimal */}
      <header className="shrink-0 z-50 w-full safe-area-top sm:hidden">
        <div className="h-14 px-5 flex items-center justify-between">
          <Link href="/" className="flex items-center" aria-label="Zhentan">
            <Image
              src="/logo.png"
              alt="Zhentan"
              width={100}
              height={32}
              className="object-contain h-7 w-auto"
              priority
            />
          </Link>
          <div
            className={clsx(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors",
              screeningMode
                ? "bg-gold/10 text-gold"
                : "bg-white/6 text-slate-500"
            )}
          >
            {screeningMode ? (
              <Shield className="h-3.5 w-3.5" />
            ) : (
              <ShieldOff className="h-3.5 w-3.5" />
            )}
            {screeningMode ? "Protected" : "Unprotected"}
          </div>
        </div>
      </header>

      {/* Desktop top bar — full nav */}
      <header className="shrink-0 z-50 w-full backdrop-blur-xl border-b border-white/6 safe-area-top hidden sm:block">
        <div className="h-16 px-6 lg:px-8 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center shrink-0" aria-label="Zhentan">
            <Image
              src="/logo.png"
              alt="Zhentan"
              width={120}
              height={40}
              className="object-contain h-9 w-auto"
              priority
            />
          </Link>

          <nav className="flex items-center gap-1 rounded-full bg-white/4 p-1 border border-white/6">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                    active
                      ? "bg-gold/12 text-gold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/6"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                  {item.badge && queuedCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-[10px] font-bold text-white leading-none">
                      {queuedCount > 99 ? "99+" : queuedCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div
            className={clsx(
              "flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-colors",
              screeningMode
                ? "bg-gold/10 text-gold border border-gold/15"
                : "bg-white/4 text-slate-500 border border-white/6"
            )}
          >
            {screeningMode ? (
              <Shield className="h-3.5 w-3.5" />
            ) : (
              <ShieldOff className="h-3.5 w-3.5" />
            )}
            Screening {screeningMode ? "ON" : "OFF"}
          </div>
        </div>
      </header>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden safe-area-bottom">
        <div className="mx-3 mb-2 rounded-2xl bg-[#0f0f14]/90 backdrop-blur-2xl border border-white/[0.08] shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-around h-16 px-2">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "relative flex flex-col items-center justify-center gap-2 flex-1 py-2 rounded-xl transition-all touch-manipulation",
                    active ? "text-gold" : "text-slate-500"
                  )}
                >
                  <div
                    className={clsx(
                      "flex items-center justify-center rounded-xl transition-all"
                    )}
                  >
                    <item.icon className={clsx("h-5 w-5", active && "stroke-[2.5px]")} />
                  </div>
                  <span className={clsx("text-[10px] font-medium leading-none", active && "font-semibold")}>
                    {item.label}
                  </span>
                  {item.badge && queuedCount > 0 && (
                    <span className="absolute top-1 right-1/4 flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-gold text-[9px] font-bold text-white leading-none">
                      {queuedCount > 99 ? "99+" : queuedCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
