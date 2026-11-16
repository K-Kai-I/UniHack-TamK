import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cho phép import file trong ../shared (deployments.json, abi).
  experimental: { externalDir: true },
  // API tự chạy db/schema.sql lúc khởi động: đưa file này vào gói chạy trên Vercel.
  outputFileTracingIncludes: { "/api/**/*": ["./db/schema.sql"] },
  // PGlite (database local khi chưa có DATABASE_URL) có file wasm, không bundle được.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  webpack: (config) => {
    // Privy và wagmi connectors import tùy chọn các gói Solana, x402, Abstract, Farcaster
    // mà app không dùng (chỉ dùng EVM trên Avalanche). Bỏ qua để build không lỗi.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/core": false,
      "@x402/evm": false,
      "@x402/svm": false,
      "@solana/kit": false,
      "@solana-program/memo": false,
      "@solana-program/system": false,
      "@solana-program/token": false,
      "@abstract-foundation/agw-client": false,
      "@farcaster/mini-app-solana": false,
      permissionless: false,
      // @metamask/sdk (qua connector MetaMask của wagmi) import tùy chọn bản React Native.
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
