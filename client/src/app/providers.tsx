"use client";

import PrivyProvider from "./context/PrivyProvider";
import { AuthProvider } from "./context/AuthContext";
import { ScreeningStatusProvider } from "./context/ScreeningStatusContext";
import { WalletConnectProvider } from "./context/WalletConnectContext";
import { ActivityDataProvider } from "./context/ActivityDataContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider>
      <AuthProvider>
        <ScreeningStatusProvider>
          <ActivityDataProvider>
            <WalletConnectProvider>{children}</WalletConnectProvider>
          </ActivityDataProvider>
        </ScreeningStatusProvider>
      </AuthProvider>
    </PrivyProvider>
  );
}
