import type { Metadata } from "next";
import { HomeGate } from "@/components/landing/auth";
import { Landing } from "@/components/landing/landing";

// GĐ0. Chưa đăng nhập: landing (render phía server). Đã đăng nhập: màn home trong components/onboarding.tsx.
// Phần "Dưới mặt nước" đọc chuỗi, nên trang làm mới mỗi 60 giây.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Két Cọc Trọ · Luôn biết tiền cọc của bạn đang ở đâu",
  description:
    "Giữ tiền cọc thuê trọ trong hợp đồng tự chạy. Ảnh nhận và trả phòng chụp trong app, mức trừ theo bảng giá có sẵn, mỗi bước có hạn chót.",
  openGraph: {
    title: "Két Cọc Trọ",
    description: "Luôn biết tiền cọc của bạn đang ở đâu. Cọc nằm trong hợp đồng, mỗi khoản trừ có ảnh và giá chốt sẵn.",
    locale: "vi_VN",
    type: "website",
  },
};

export default function Home() {
  return (
    <HomeGate>
      <Landing />
    </HomeGate>
  );
}
