"use client";

import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Sidebar } from "@/components/Sidebar";
import { RightRail } from "@/components/RightRail";
import { TopBar } from "@/components/TopBar";

/** Routes that show the right co-sign rail on desktop. */
const RAIL_ROUTES = ["/home"];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showRail = RAIL_ROUTES.includes(pathname);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      {showRail && <RightRail />}
      <div className={clsx("lg:pl-64", showRail && "xl:pr-[22rem]")}>
        <TopBar />
        {children}
      </div>
    </div>
  );
}
