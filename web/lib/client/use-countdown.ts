"use client";
// Đếm ngược tới hạn chót (deadline đọc từ contract). Chỉ chạy đồng hồ khi còn hạn; hết hạn thì dừng
// và gọi onExpire một lần (màn hình dùng để tải lại deal, vì lúc đó canPoke đổi thành true).
import { useEffect, useRef, useState } from "react";
import type { IsoTime } from "@/lib/types";

export function useCountdown(deadline: IsoTime | null, onExpire?: () => void) {
  const target = deadline ? Date.parse(deadline) : null;
  const [now, setNow] = useState(() => Date.now());
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  const passed = target !== null && now >= target;

  useEffect(() => {
    if (target === null || Date.now() >= target) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= target) {
        clearInterval(t);
        expireRef.current?.();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [target]);

  return { now, passed, msLeft: target === null ? null : Math.max(0, target - now) };
}

/** 2 ngày 3 giờ · 3 giờ 05 phút · 02:59 */
export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} ngày ${h} giờ`;
  if (h > 0) return `${h} giờ ${String(m).padStart(2, "0")} phút`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
