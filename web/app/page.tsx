import { Onboarding } from "@/components/onboarding";
import { NetworkBanner } from "@/components/network-banner";

// GĐ0: Đăng nhập, chọn vai trò. Logic phía client nằm trong components/onboarding.tsx.
export default function Home() {
  return (
    <>
      <NetworkBanner />
      <Onboarding />
    </>
  );
}
