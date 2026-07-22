"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Settings, User, Bell, Shield, ShieldOff, type LucideIcon } from "lucide-react";
import { clsx } from "clsx";
import { useScreeningStatus } from "@/app/context/ScreeningStatusContext";
import { useActivityData } from "@/app/context/ActivityDataContext";
import { BrandMark } from "@/components/BrandMark";

export const navItems: {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: boolean;
  /** Guided-tour anchor — stamped as data-tour on both navs. */
  tour?: string;
}[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/requests", label: "Requests", icon: Bell, badge: true, tour: "nav-requests" },
  { href: "/settings", label: "Settings", icon: Settings, tour: "nav-settings" },
  { href: "/profile", label: "Profile", icon: User },
];

export function TopBar() {
  const pathname = usePathname();
  const { isScreeningActive } = useScreeningStatus();
  const { queuedCount } = useActivityData();

  return (
    <>
      {/* Mobile top bar — minimal */}
      <header className="shrink-0 z-50 w-full safe-area-top sm:hidden">
        <div className="h-14 px-5 flex items-center justify-between">
          <BrandMark href="/home" size="sm" priority />
          <div
            data-tour="agent-status"
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors",
              isScreeningActive
                ? "bg-safe/12 text-safe"
                : "bg-foreground/6 text-muted-foreground"
            )}
          >
            {isScreeningActive ? (
              <Shield className="h-3.5 w-3.5" />
            ) : (
              <ShieldOff className="h-3.5 w-3.5" />
            )}
            {isScreeningActive ? "Watching" : "Paused"}
          </div>
        </div>
      </header>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden safe-area-bottom">
        <div className="mx-3 mb-2 rounded-2xl bg-card/90 backdrop-blur-2xl border border-border shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-around h-16 px-2">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-tour={item.tour}
                  className={clsx(
                    "relative flex flex-col items-center justify-center gap-2 flex-1 py-2 rounded-xl transition-all touch-manipulation",
                    active ? "text-gold" : "text-muted-foreground"
                  )}
                >
                  <item.icon className={clsx("h-5 w-5", active && "stroke-[2.5px]")} />
                  <span
                    className={clsx(
                      "text-[10px] font-medium leading-none",
                      active && "font-semibold"
                    )}
                  >
                    {item.label}
                  </span>
                  {item.badge && queuedCount > 0 && (
                    <span className="absolute top-1 right-1/4 flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-pill bg-gold text-[9px] font-bold text-ink-900 leading-none">
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
