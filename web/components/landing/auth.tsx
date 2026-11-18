"use client";
// Phần landing cần Privy: đồng bộ dấu phiên, nút đăng nhập / "Vào app", thanh nút dính đáy.
// "/" luôn là landing (kể cả đã đăng nhập, để giám khảo xem được); màn home của app ở /home.
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const APP_HOME = "/home";

/**
 * Script đầu trang (app/page.tsx) đoán phiên từ localStorage để chọn nút ngay lúc vẽ trang.
 * Privy xong thì đặt lại dấu theo kết quả thật.
 */
export function SessionSync() {
  const { ready, authenticated } = usePrivy();
  useEffect(() => {
    if (!ready) return;
    if (authenticated) document.documentElement.dataset.session = "1";
    else delete document.documentElement.dataset.session;
  }, [ready, authenticated]);
  return null;
}

type Size = "default" | "lg";
type Variant = "default" | "outline" | "secondary" | "ghost";

/** Bấm trước khi Privy sẵn sàng thì nhớ lại; đăng nhập xong từ nút này thì vào thẳng app. */
export function LoginButton({ children = "Bắt đầu với Google", variant = "default", size = "lg", className, arrow = true }: {
  children?: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  arrow?: boolean;
}) {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const clicked = useRef(false);

  useEffect(() => {
    if (ready && pending) {
      setPending(false);
      login();
    }
  }, [ready, pending, login]);

  // Chỉ chuyển trang khi người dùng vừa đăng nhập bằng chính nút này, không đẩy người đang xem landing đi.
  useEffect(() => {
    if (clicked.current && authenticated) router.push(APP_HOME);
  }, [authenticated, router]);

  return (
    <Button
      variant={variant}
      size={size}
      className={cn("group/login", className)}
      aria-busy={pending || undefined}
      onClick={() => {
        clicked.current = true;
        if (ready) login();
        else setPending(true);
      }}
    >
      {children}
      {arrow && <ArrowRight aria-hidden="true" className="transition-transform duration-200 ease-out group-hover/login:translate-x-0.5" />}
    </Button>
  );
}

/** Nút hành động chính: khách thấy nút đăng nhập, người đã đăng nhập thấy "Vào app". CSS chọn theo <html data-session>. */
export function AuthCta({ guest = "Bắt đầu với Google", member = "Vào app", variant = "default", memberVariant, size = "lg", className, arrow = true }: {
  guest?: string;
  member?: string;
  variant?: Variant;
  memberVariant?: Variant;
  size?: Size;
  className?: string;
  arrow?: boolean;
}) {
  return (
    <>
      <span data-when-guest>
        <LoginButton variant={variant} size={size} className={className} arrow={arrow}>{guest}</LoginButton>
      </span>
      <span data-when-session>
        <Button asChild variant={memberVariant ?? variant} size={size} className={cn("group/login", className)}>
          <Link href={APP_HOME}>
            {member}
            <ArrowRight aria-hidden="true" className="transition-transform duration-200 ease-out group-hover/login:translate-x-0.5" />
          </Link>
        </Button>
      </span>
    </>
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
      <AuthCta className="w-full" />
    </div>
  );
}
