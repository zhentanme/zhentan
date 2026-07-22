"use client";

import { PrivyProvider as PrivyReactProvider } from "@privy-io/react-auth";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

export default function PrivyProvider({ children }: { children: React.ReactNode }) {
  if (!PRIVY_APP_ID) {
    return <>{children}</>;
  }

  return (
    <PrivyReactProvider
      appId={PRIVY_APP_ID}
      config={{
        embeddedWallets: {
          ethereum: {
            // Only Google (and other no-wallet) logins mint an embedded wallet.
            // A user who logs in by connecting an external wallet uses THAT
            // wallet as their signer — no embedded wallet is created for them.
            createOnLogin: "users-without-wallets",
          },
        },
        loginMethods: ["google", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#c49428",
        },
      }}
    >
      {children}
    </PrivyReactProvider>
  );
}
