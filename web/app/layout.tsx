import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/client/providers";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

// Be Vietnam Pro: thiết kế cho tiếng Việt, dấu không bị đè. Subset "vietnamese" bắt buộc.
const sans = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

// JetBrains Mono: địa chỉ ví, hash, mã giao dịch.
const mono = JetBrains_Mono({
  subsets: ["latin", "vietnamese"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Két Cọc Trọ",
  description: "Giữ tiền cọc thuê trọ bằng smart contract trên Avalanche",
};

export const viewport: Viewport = {
  themeColor: "#30254b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={cn("font-sans", sans.variable, mono.variable)} suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
