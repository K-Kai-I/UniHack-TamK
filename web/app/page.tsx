import type { Metadata } from "next";
import { SessionSync } from "@/components/landing/auth";
import { Landing } from "@/components/landing/landing";

// Chạy trước khi trình duyệt vẽ landing: có token Privy trong localStorage thì đánh dấu <html data-session>,
// để nút "Vào app" hiện ngay thay cho nút đăng nhập, không nháy. Đây chỉ là đoán để chọn nút hiển thị;
// SessionSync đặt lại theo Privy, và quyền truy cập vẫn do Privy quyết định.
const SESSION_HINT = `try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(/^privy:(.+:)?(token|refresh_token)$/.test(k)&&localStorage.getItem(k)){document.documentElement.dataset.session="1";break}}}catch(e){}`;

// "/" luôn là landing, kể cả khi đã đăng nhập (giám khảo xem được). Màn home của app ở /home.
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
      <SessionSync />
      <Landing />
    </>
  );
}
