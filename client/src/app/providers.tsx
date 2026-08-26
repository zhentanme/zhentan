"use client";

import PrivyProvider from "./context/PrivyProvider";
import { AuthProvider } from "./context/AuthContext";
import { ScreeningStatusProvider } from "./context/ScreeningStatusContext";
import { WalletConnectProvider } from "./context/WalletConnectContext";
import { ActivityDataProvider } from "./context/ActivityDataContext";
import { ToastProvider } from "@/components/ui/Toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider>
      <AuthProvider>
        <ScreeningStatusProvider>
          <ActivityDataProvider>
            <WalletConnectProvider>
              <ToastProvider>{children}</ToastProvider>
            </WalletConnectProvider>
          </ActivityDataProvider>
        </ScreeningStatusProvider>
      </AuthProvider>
    </PrivyProvider>
  );
}
