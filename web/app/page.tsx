import { LoginButton } from "@/lib/client/LoginButton";

// Trang tạm cho cổng G0: mở trên điện thoại, đăng nhập Google, thấy địa chỉ ví.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-2xl font-bold">Két Cọc Trọ</h1>
      <p className="text-gray-600">Tiền cọc nằm trong két, không ai tự rút được.</p>
      <LoginButton />
    </main>
  );
}
