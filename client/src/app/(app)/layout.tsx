import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { RightRail } from "@/components/RightRail";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <RightRail />
      <div className="lg:pl-64 xl:pr-[22rem]">
        <TopBar />
        {children}
      </div>
    </div>
  );
}
