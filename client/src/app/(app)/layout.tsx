import { TopBar } from "@/components/TopBar";

export default function Layout({ children }: { children: React.ReactNode }) {
    return <div className="flex flex-col h-screen bg-background">
        <TopBar />
        {children}</div>;
}