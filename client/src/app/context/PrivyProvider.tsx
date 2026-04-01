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
            createOnLogin: "all-users",
          },
        },
        loginMethods: ["google"],
        appearance: {
          theme: "dark",
          accentColor: "#e5a832",
        },
      }}
    >
      {children}
    </PrivyReactProvider>
  );
}
