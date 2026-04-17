"use client";

import PrivyProvider from "./context/PrivyProvider";
import { AuthProvider } from "./context/AuthContext";
import { ScreeningStatusProvider } from "./context/ScreeningStatusContext";
import { WalletConnectProvider } from "./context/WalletConnectContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider>
      <AuthProvider>
        <ScreeningStatusProvider>
          <WalletConnectProvider>{children}</WalletConnectProvider>
        </ScreeningStatusProvider>
      </AuthProvider>
    </PrivyProvider>
  );
}
