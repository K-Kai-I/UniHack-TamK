"use client";
// Privy (đăng nhập Google tạo ví) + wagmi (gọi contract) + react-query.
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "wagmi";
import { avalancheFuji } from "viem/chains";
import { useState, type ReactNode } from "react";

export const wagmiConfig = createConfig({
  chains: [avalancheFuji],
  transports: { [avalancheFuji.id]: http() },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    return (
      <p style={{ padding: 16 }}>
        Thiếu NEXT_PUBLIC_PRIVY_APP_ID trong web/.env.local (xem web/.env.example).
      </p>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["google", "wallet"],
        defaultChain: avalancheFuji,
        supportedChains: [avalancheFuji],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        appearance: { theme: "light" },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
