import type { Metadata } from "next";
import { HomeGate } from "@/components/landing/auth";
import { Landing } from "@/components/landing/landing";
import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

// Chạy trước khi trình duyệt vẽ landing: có token Privy trong localStorage thì đánh dấu <html data-session>,
// CSS giấu landing và hiện khung chờ, để người đã đăng nhập không thấy landing nháy lên rồi biến mất.
// Đây chỉ là đoán để chọn khung hiển thị; quyền truy cập vẫn do Privy quyết định.
const SESSION_HINT = `try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(/^privy:(.+:)?(token|refresh_token)$/.test(k)&&localStorage.getItem(k)){document.documentElement.dataset.session="1";break}}}catch(e){}`;

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
    <>
      <script dangerouslySetInnerHTML={{ __html: SESSION_HINT }} />
      <HomeGate>
        <div data-session-skeleton role="status" aria-busy="true" aria-label="Đang mở Két Cọc Trọ">
          <PageShell className="flex flex-col gap-8 pt-5 sm:pt-6">
            <Skeleton className="h-12 w-48 rounded-xl" />
            <Skeleton className="h-10 w-2/3 rounded-xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </PageShell>
        </div>
        <div data-landing>
          <Landing />
        </div>
      </HomeGate>
    </>
  );
}
