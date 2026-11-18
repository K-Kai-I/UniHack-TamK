import type { Metadata } from "next";
import { Onboarding } from "@/components/onboarding";
import { NetworkBanner } from "@/components/network-banner";

// Màn home của app: chưa đăng nhập thì mời đăng nhập, đã đăng nhập thì "Hôm nay, bạn cần làm gì?".
// Logic phía client nằm trong components/onboarding.tsx. Landing giới thiệu ở "/".
export const metadata: Metadata = { title: "Két Cọc Trọ" };

export default function AppHome() {
  return (
    <>
      <NetworkBanner />
      <Onboarding />
    </>
  );
}
