"use client";
// Màn "Đăng nhập, chọn vai trò" (docs/user-flow.md GĐ0, P0).
// Chưa đăng nhập: hero + nút đăng nhập. Đã đăng nhập: ví, nhận tiền test, chọn vai trò.
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowRight, Camera, ChevronRight, Clock, FileText, Gavel, House, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BorderBeam } from "@/components/ui/border-beam";
import { WalletChip } from "@/components/wallet-chip";
import { FaucetButton } from "@/components/faucet-button";
import { fetchJurorDisputes } from "@/lib/client/disputes-api";
import { useUiRole, type UiRole } from "@/lib/client/role";
import type { Address } from "@/lib/types";
import { cn } from "@/lib/utils";

// TODO(spec): spec chưa chốt đường dẫn màn. Tạm theo DEVELOPER.md (web/app/rooms/...).
const ROLE_HOME: Record<UiRole, string> = {
  tenant: "/rooms", // Phòng đang trống
  landlord: "/listings/new", // Đăng phòng + hợp đồng
};

const FEATURES = [
  { icon: ShieldCheck, title: "Tiền nằm trong két", text: "Smart contract giữ cọc. Không ai tự rút được." },
  { icon: Camera, title: "AI so ảnh trước và sau", text: "Chụp lúc nhận và trả phòng, AI tính mức trừ." },
  { icon: Clock, title: "Hạn chót rõ ràng", text: "Bên nào im lặng tới hạn thì bên đó chịu." },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md">
        <ShieldCheck className="size-6" />
      </div>
      <span className="text-lg font-extrabold tracking-tight text-primary">Két Cọc Trọ</span>
    </div>
  );
}

export function Onboarding() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { address } = useAccount();
  const { role, setRole } = useUiRole();

  if (!ready) {
    return (
      <Shell>
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full" />
      </Shell>
    );
  }

  if (!authenticated) {
    return (
      <Shell>
        <motion.section initial="hidden" animate="show" className="space-y-4">
          <motion.h1
            variants={fadeUp}
            custom={0}
            className="text-[2.5rem] leading-[1.1] font-extrabold tracking-tight text-primary"
          >
            Giữ cọc trọ
            <br />
            <span className="text-success">minh bạch</span>, không lo mất.
          </motion.h1>
          <motion.p variants={fadeUp} custom={1} className="text-lg text-muted-foreground">
            Tiền cọc nằm trong smart contract trên Avalanche. Trả phòng xong, tiền về đúng người.
          </motion.p>
        </motion.section>

        <motion.ul initial="hidden" animate="show" className="space-y-3">
          {FEATURES.map((f, i) => (
            <motion.li key={f.title} variants={fadeUp} custom={i + 2}>
              <Card className="flex-row items-start gap-3 p-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                  <f.icon className="size-5" />
                </div>
                <div>
                  <p className="font-semibold">{f.title}</p>
                  <p className="text-sm text-muted-foreground">{f.text}</p>
                </div>
              </Card>
            </motion.li>
          ))}
        </motion.ul>

        <div className="sticky bottom-0 -mx-5 mt-auto space-y-2 bg-gradient-to-t from-background via-background to-transparent px-5 pt-6 pb-6">
          <ShimmerButton
            className="h-14 w-full text-base font-semibold"
            background="#0b2545"
            shimmerColor="#6ee7b7"
            onClick={login}
          >
            Đăng nhập bằng Google
          </ShimmerButton>
          <p className="text-center text-xs text-muted-foreground">
            Có ví sẵn? Chọn &quot;Ví&quot; trong cửa sổ đăng nhập. Ví được tạo tự động nếu chưa có.
          </p>
        </div>
      </Shell>
    );
  }

  const email = user?.google?.email ?? user?.email?.address;

  return (
    <Shell
      action={
        <Button variant="ghost" size="icon" onClick={logout} aria-label="Đăng xuất">
          <LogOut />
        </Button>
      }
    >
      <section className="space-y-3">
        <p className="text-sm text-muted-foreground">{email ? `Xin chào, ${email}` : "Xin chào"}</p>
        <Card className="relative gap-4 overflow-hidden bg-primary p-5 text-primary-foreground">
          <div className="space-y-1">
            <p className="text-sm text-primary-foreground/70">Ví của bạn trên Avalanche Fuji</p>
            <WalletChip address={address} />
          </div>
          <p className="text-sm text-primary-foreground/80">
            Đây là mạng thử nghiệm. Nhận tiền test để gửi cọc hoặc trả phí.
          </p>
          <BorderBeam size={120} duration={8} colorFrom="#10b981" colorTo="#6ee7b7" />
        </Card>
        <FaucetButton />
        <MyDealsEntry />
        {address && <JurorEntry address={address} />}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Bạn đang muốn…</h2>
        <div className="grid gap-3">
          <RoleCard
            active={role === "tenant"}
            onClick={() => setRole("tenant")}
            icon={KeyRound}
            title="Tôi thuê phòng"
            text="Tìm phòng trống, gửi cọc, chụp ảnh nhận và trả phòng."
          />
          <RoleCard
            active={role === "landlord"}
            onClick={() => setRole("landlord")}
            icon={House}
            title="Tôi cho thuê"
            text="Đăng phòng, đặt bảng giá hư hỏng, nhận cọc an toàn."
          />
        </div>
        <p className="text-xs text-muted-foreground">Đổi vai trò lúc nào cũng được. Một ví dùng được cả hai.</p>
      </section>

      <div className="sticky bottom-0 -mx-5 mt-auto bg-gradient-to-t from-background via-background to-transparent px-5 pt-6 pb-6">
        {role ? (
          <Button asChild size="lg" className="h-14 w-full text-base">
            <Link href={ROLE_HOME[role]}>
              {role === "tenant" ? "Xem phòng đang trống" : "Đăng phòng mới"} <ArrowRight />
            </Link>
          </Button>
        ) : (
          <Button size="lg" className="h-14 w-full text-base" disabled>
            Chọn vai trò để tiếp tục
          </Button>
        )}
      </div>
    </Shell>
  );
}

/** Lối vào màn "Hợp đồng của tôi". Luôn hiện: không có thông báo đẩy, đây là nơi xem có người vừa cọc. */
function MyDealsEntry() {
  return (
    <Link
      href="/deals"
      className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 transition hover:bg-secondary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <FileText className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Hợp đồng của tôi</span>
        <span className="text-sm text-muted-foreground">Phòng bạn cho thuê và phòng bạn thuê</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/** Lối vào màn Bồi thẩm: chỉ hiện khi contract báo ví này là bồi thẩm (isJuror, qua GET /disputes?juror=). */
function JurorEntry({ address }: { address: Address }) {
  const { data } = useQuery({
    queryKey: ["juror-disputes", address],
    queryFn: () => fetchJurorDisputes(address),
    staleTime: 30_000,
  });
  if (!data?.isJuror) return null;
  const n = data.items.length;
  return (
    <Link
      href="/jury"
      className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 transition hover:bg-secondary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
        <Gavel className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Bạn là bồi thẩm</span>
        <span className="text-sm text-muted-foreground">{n > 0 ? `${n} vụ đang chờ phiếu của bạn` : "Chưa có vụ nào chờ phiếu"}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function Shell({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 pt-5">
      <header className="flex items-center justify-between">
        <Logo />
        {action}
      </header>
      {children}
    </main>
  );
}

function RoleCard({
  active,
  onClick,
  icon: Icon,
  title,
  text,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-start gap-4 rounded-2xl border-2 bg-card p-4 text-left shadow-sm transition active:scale-[0.98]",
        active ? "border-success bg-accent" : "border-transparent hover:border-border",
      )}
    >
      <div
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-xl",
          active ? "bg-success text-success-foreground" : "bg-secondary text-primary",
        )}
      >
        <Icon className="size-6" />
      </div>
      <div>
        <p className="font-bold">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </button>
  );
}
