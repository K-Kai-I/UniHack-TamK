"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

export function LoginButton() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address } = useAccount();

  if (!ready) return <button disabled>Đang tải…</button>;
  if (!authenticated)
    return (
      <button onClick={login} className="rounded-lg bg-black px-4 py-2 text-white">
        Đăng nhập
      </button>
    );
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="font-mono text-sm">{address ?? "Đang tạo ví…"}</p>
      <button onClick={logout} className="rounded-lg border px-4 py-2">
        Đăng xuất
      </button>
    </div>
  );
}
