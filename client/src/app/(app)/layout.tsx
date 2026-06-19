import { AppFrame } from "@/components/AppFrame";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
