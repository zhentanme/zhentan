"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { RightRail } from "@/components/RightRail";
import { SignerMismatchBanner } from "@/components/SignerMismatchNotice";
import { TopBar } from "@/components/TopBar";
import { TourProvider } from "@/components/tour/TourProvider";
import { TourLauncher } from "@/components/tour/TourLauncher";

/** Routes that show the right co-sign rail on desktop. */
const RAIL_ROUTES = ["/home"];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showRail = RAIL_ROUTES.includes(pathname);

  return (
    <TourProvider>
      <div className="min-h-screen bg-background">
        <Sidebar />
        {showRail && <RightRail />}
        {/* Reserve the rail's gutter on every route so each page's content band
            ends at the same line — whether or not the rail is rendered. */}
        <div className="lg:pl-64 xl:pr-[22rem]">
          <TopBar />
          {/* Profile has its own inline warning beside the signer row. */}
          {pathname !== "/profile" && <SignerMismatchBanner />}
          {children}
        </div>
      </div>
      <TourLauncher />
    </TourProvider>
  );
}
