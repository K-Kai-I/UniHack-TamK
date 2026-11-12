import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/lib/client/providers";

export const metadata: Metadata = {
  title: "Két Cọc Trọ",
  description: "Giữ tiền cọc thuê trọ bằng smart contract trên Avalanche",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
