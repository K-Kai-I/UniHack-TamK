"use client";
// Màn thành công dùng chung sau mỗi bước có giao dịch (gửi cọc, gửi ảnh, đề xuất, kháng nghị):
// che toàn màn hình, nói rõ đã xong việc gì, rồi tự quay về màn chính của hợp đồng sau vài giây.
// Người dùng bấm nút để về ngay. Link Snowtrace nằm ở màn hợp đồng (Kiểm chứng trên chuỗi).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECONDS = 4;

export function SuccessScreen({ title, text, href, label = "Về hợp đồng" }: { title: string; text?: string; href: string; label?: string }) {
  const router = useRouter();
  const [left, setLeft] = useState(SECONDS);
  const heading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (left <= 0) { router.push(href); return; }
    const id = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left, href, router]);

  // Gắn thẳng vào <body>: màn gọi có thể nằm trong drawer có transform, khi đó "fixed" không phủ được cả màn hình.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="status" aria-live="polite" className="fixed inset-0 z-[60] grid place-items-center bg-background p-6">
      <div className="w-full max-w-sm space-y-5 text-center">
        <span className="mx-auto grid size-20 place-items-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="size-11" aria-hidden="true" />
        </span>
        <div className="space-y-2">
          <h2 ref={heading} tabIndex={-1} className="text-2xl font-extrabold tracking-tight text-primary outline-none">{title}</h2>
          {text && <p className="text-muted-foreground">{text}</p>}
        </div>
        <Button size="lg" className="w-full text-base" onClick={() => router.push(href)}>{label}</Button>
        <p className="text-sm text-muted-foreground tabular-nums">Tự chuyển sau {Math.max(left, 0)} giây</p>
      </div>
    </div>,
    document.body,
  );
}
