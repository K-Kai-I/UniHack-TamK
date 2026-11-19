"use client";
// Privy (đăng nhập Google tạo ví) + wagmi (gọi contract) + react-query.
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import type { ConnectedWallet } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "wagmi";
import { avalancheFuji } from "viem/chains";
import { useState, type ReactNode } from "react";

export const wagmiConfig = createConfig({
  chains: [avalancheFuji],
  transports: { [avalancheFuji.id]: http() },
});

// Luôn ký bằng ví nhúng Privy (tạo khi đăng nhập Google), kể cả khi trình duyệt có MetaMask.
// Không có dòng này, Privy có thể lấy MetaMask làm ví chính và mỗi lần ký lại nhảy sang tab MetaMask.
// Server (lib/server/auth.ts) cũng ưu tiên ví nhúng, nên client và server luôn cùng một ví.
function pickEmbedded({ wallets }: { wallets: ConnectedWallet[] }) {
  return wallets.find((w) => w.walletClientType === "privy") ?? wallets[0];
}

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
        // Chỉ Google: ai cũng có ví nhúng, không cần biết crypto, không phải cài MetaMask.
        loginMethods: ["google"],
        defaultChain: avalancheFuji,
        supportedChains: [avalancheFuji],
        embeddedWallets: { ethereum: { createOnLogin: "all-users" } },
        appearance: { theme: "light" },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig} setActiveWalletForWagmi={pickEmbedded}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
