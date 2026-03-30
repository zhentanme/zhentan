"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bell,
  Settings,
  User,
  ShieldCheck,
} from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/profile", label: "Profile", icon: User },
];

interface SidebarProps {
  screeningMode: boolean;
}

export function Sidebar({ screeningMode }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-64 min-h-screen bg-white/3 flex flex-col">
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gold/15 flex items-center justify-center shadow-[0_0_20px_-4px_rgba(229,168,50,0.25)]">
          <ShieldCheck className="h-5 w-5 text-gold" />
        </div>
        <span className="text-lg font-bold text-gold">Zhentan</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all",
                active
                  ? "bg-gold/10 text-gold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/6"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Screening badge */}
      <div className="p-4 mx-3 mb-4 rounded-2xl bg-white/6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.2)]">
        <div className="flex items-center gap-2 text-sm">
          <div
            className={clsx(
              "w-2 h-2 rounded-full",
              screeningMode ? "bg-gold animate-pulse" : "bg-slate-500"
            )}
          />
          <span className="text-slate-400">Screening</span>
          <span
            className={clsx(
              "ml-auto font-medium",
              screeningMode ? "text-gold" : "text-slate-500"
            )}
          >
            {screeningMode ? "ON" : "OFF"}
          </span>
        </div>
      </div>
    </aside>
  );
}
