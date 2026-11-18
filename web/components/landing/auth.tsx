"use client";
// Phần landing cần Privy: nút đăng nhập và cổng chọn landing / màn home.
import { useEffect, useState, type ReactNode } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Onboarding } from "@/components/onboarding";
import { NetworkBanner } from "@/components/network-banner";
import { cn } from "@/lib/utils";

/**
 * Chưa đăng nhập: landing (render sẵn phía server, nên ai mở link cũng thấy ngay).
 * Đã đăng nhập: giữ nguyên màn "Hôm nay, bạn cần làm gì?".
 * Privy chỉ biết phiên ở phía client, nên trong lúc Privy chưa sẵn sàng vẫn hiện landing.
 */
export function HomeGate({ children }: { children: ReactNode }) {
  const { ready, authenticated } = usePrivy();
  if (ready && authenticated) {
    return (
      <>
        <NetworkBanner />
        <Onboarding />
      </>
    );
  }
  return <>{children}</>;
}

/** Bấm trước khi Privy sẵn sàng thì nhớ lại, mở cửa sổ đăng nhập ngay khi Privy xong. */
export function LoginButton({ children = "Bắt đầu với Google", variant = "default", size = "lg", className, arrow = true }: {
  children?: ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "lg";
  className?: string;
  arrow?: boolean;
}) {
  const { ready, login } = usePrivy();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (ready && pending) {
      setPending(false);
      login();
    }
  }, [ready, pending, login]);

  return (
    <Button
      variant={variant}
      size={size}
      className={cn("group/login", className)}
      aria-busy={pending || undefined}
      onClick={() => (ready ? login() : setPending(true))}
    >
      {children}
      {arrow && <ArrowRight aria-hidden="true" className="transition-transform duration-200 ease-out group-hover/login:translate-x-0.5" />}
    </Button>
  );
}

/** Điện thoại: khi nút ở hero đã cuộn qua và chưa tới lời kết, giữ một nút trong tầm ngón cái. */
export function StickyCta() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("hero-cta");
    const close = document.getElementById("close-cta");
    if (!hero || !close) return;
    const seen = { hero: true, close: false };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) seen.hero = e.isIntersecting || e.boundingClientRect.top > 0;
        if (e.target === close) seen.close = e.isIntersecting || e.boundingClientRect.top < 0;
      }
      setShow(!seen.hero && !seen.close);
    });
    io.observe(hero);
    io.observe(close);
    return () => io.disconnect();
  }, []);
  return (
    <div
      aria-hidden={!show}
      inert={!show}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm transition-[translate,visibility] duration-300 ease-out md:hidden",
        show ? "visible translate-y-0" : "invisible translate-y-full",
      )}
    >
      <LoginButton className="w-full" />
    </div>
  );
}
