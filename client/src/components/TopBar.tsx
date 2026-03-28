"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useApiClient } from "@/lib/api/client";
import { useAuth } from "@/app/context/AuthContext";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Settings, User, Bell } from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { href: "/app", label: "App", icon: LayoutDashboard },
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
    <header className="flex-shrink-0 z-50 w-full bg-white/[0.05] backdrop-blur-md border-b border-white/10 safe-area-top">
      <div className="h-14 lg:h-16 px-3 sm:px-4 lg:px-8 flex items-center justify-between gap-2 sm:gap-4 min-w-0">
        {/* Left: Logo + brand */}
        <Link
          href="/"
          className="flex items-center rounded-full py-1 min-w-0 flex-shrink-0 h-16 lg:h-24 aspect-video"
          aria-label="Zhentan"
        >

          <Image
            src="/logo.png"
            alt="Zhentan"
            width={176}
            height={64}
            className="object-contain"
            priority
          />

        </Link>

     <div className="flex-1 flex justify-center items-center">
         {/* Center: Nav links */}
         <nav className="flex items-center gap-0.5 sm:gap-1 rounded-full bg-white/[0.04] p-0.5 sm:p-1 w-fit border border-white/5 overflow-x-auto scrollbar-hide min-w-0 justify-end sm:justify-center sm:flex-initial">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "relative flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-full text-sm font-medium transition-all flex-shrink-0 min-h-[2.25rem] touch-manipulation",
                  active
                    ? "bg-claw/15 text-claw"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]"
                )}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline">{item.label}</span>
                {item.badge && queuedCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-claw text-[10px] font-bold text-white leading-none">
                    {queuedCount > 99 ? "99+" : queuedCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

     </div>
        {/* Right: Screening pill */}
        <div className="flex items-center gap-1.5 sm:gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0">
          <div
            className={clsx(
              "w-2 h-2 rounded-full flex-shrink-0",
              screeningMode ? "bg-claw animate-pulse" : "bg-slate-500"
            )}
          />
          <span className="text-xs font-medium text-slate-400 hidden sm:inline">Screening</span>
          <span
            className={clsx(
              "text-xs font-semibold",
              screeningMode ? "text-claw" : "text-slate-500"
            )}
          >
            {screeningMode ? "ON" : "OFF"}
          </span>
        </div>
      </div>
    </header>
  );
}
