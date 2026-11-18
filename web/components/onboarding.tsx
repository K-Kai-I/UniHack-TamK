"use client";
// GĐ0: đăng nhập qua Privy; vai trò chỉ chọn lối đi, không cấp quyền.
import type { ReactNode } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, FileText, Gavel, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionArea } from "@/components/action-area";
import { Illustration } from "@/components/illustration";
import { PageColumns, PageShell } from "@/components/page-shell";
import { WalletChip } from "@/components/wallet-chip";
import { FaucetButton } from "@/components/faucet-button";
import { fetchJurorDisputes } from "@/lib/client/disputes-api";
import { useUiRole, type UiRole } from "@/lib/client/role";
import type { Address } from "@/lib/types";
import { cn } from "@/lib/utils";

// TODO(spec): spec chưa chốt đường dẫn màn. Tạm theo DEVELOPER.md (web/app/rooms/...).
const ROLE_HOME: Record<UiRole, string> = { tenant: "/rooms", landlord: "/listings/new" };
const MILESTONES = [
  { title: "Gửi cọc theo điều khoản", text: "Cọc được khóa trong hợp đồng. Mỗi bên chỉ nhận tiền theo quy tắc đã chốt." },
  { title: "Chụp ảnh lúc nhận và trả phòng", text: "Ảnh cùng vị trí giúp đối chiếu căn phòng qua hai mốc. AI so ảnh để nhận diện hư hỏng." },
  { title: "Xem mức trừ trước khi phản hồi", text: "Mức trừ dựa trên bảng giá đã chốt. Người thuê có thể đồng ý hoặc kháng nghị trong hạn." },
];

export function Onboarding() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { address } = useAccount();
  const { role, setRole } = useUiRole();
  return (
    <OnboardingView
      ready={ready} authenticated={authenticated}
      email={user?.google?.email ?? user?.email?.address}
      role={role} onRoleChange={setRole} onLogin={login} onLogout={logout}
      wallet={<WalletChip address={address} />} faucet={<FaucetButton />}
      jurorEntry={address ? <JurorEntry address={address} /> : null}
    />
  );
}

/** Trang mẫu dùng cùng phần trình bày, không giả phiên đăng nhập sản phẩm. */
export function OnboardingView({ ready, authenticated, email, role, onRoleChange, onLogin, onLogout, wallet, faucet, jurorEntry }: {
  ready: boolean;
  authenticated: boolean;
  email?: string;
  role: UiRole | null;
  onRoleChange: (role: UiRole) => void;
  onLogin: () => void;
  onLogout: () => void;
  wallet: ReactNode;
  faucet: ReactNode;
  jurorEntry?: ReactNode;
}) {
  return (
    <PageShell className="flex flex-col gap-8 pt-5 sm:pt-6 lg:gap-12">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-5">
        <div className="flex items-center gap-2.5 text-primary">
          <ShieldCheck className="size-8 shrink-0" aria-hidden="true" />
          <span className="text-lg font-extrabold tracking-tight">Két Cọc Trọ</span>
        </div>
        {ready && authenticated && <Button variant="ghost" onClick={onLogout}><LogOut aria-hidden="true" /> Đăng xuất</Button>}
      </header>
      {!ready ? (
        <div role="status" aria-busy="true" className="space-y-6">
          <h1 className="text-2xl font-bold">Đang mở Két Cọc Trọ…</h1>
          <PageColumns aria-hidden="true">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </PageColumns>
        </div>
      ) : !authenticated ? (
        <PageColumns>
          <section aria-labelledby="welcome-title" className="space-y-8 lg:space-y-12">
            <div className="max-w-prose space-y-4">
              <h1 id="welcome-title" className="text-[2rem] leading-tight font-extrabold tracking-tight text-primary sm:text-[2.5rem]">
                Tiền cọc rõ ràng,<br className="hidden sm:block" /> từ nhận đến trả phòng.
              </h1>
              <p className="text-base text-muted-foreground sm:text-lg">Giữ điều khoản, ảnh căn phòng và mức trừ ở cùng một nơi. Biết ai cần làm gì và trước lúc nào.</p>
              <TestnetNote />
            </div>
            <Illustration kind="handover" className="max-w-52 sm:max-w-60" />
            <ol aria-label="Các mốc của tiền cọc" className="divide-y border-y">
              {MILESTONES.map((milestone, index) => (
                <li key={milestone.title} className="flex gap-4 py-5">
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-primary">{index + 1}</span>
                  <div className="space-y-1">
                    <h2 className="font-bold">{milestone.title}</h2>
                    <p className="max-w-prose text-sm text-muted-foreground">{milestone.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <aside aria-labelledby="start-title" className="space-y-5 lg:self-start lg:rounded-2xl lg:border lg:p-6">
            <h2 id="start-title" className="text-xl font-bold">Bắt đầu với tài khoản của bạn</h2>
            <p className="text-sm text-muted-foreground">Đăng nhập để xem hợp đồng, tìm phòng hoặc đăng phòng cho thuê.</p>
            <p className="text-sm text-muted-foreground">Chưa có ví, hệ thống sẽ tạo khi bạn đăng nhập.</p>
            <ActionArea>
              <Button size="lg" className="w-full" onClick={onLogin}>Đăng nhập bằng Google</Button>
              <p className="text-center text-sm text-muted-foreground">Đã có ví? Chọn “Ví” trong cửa sổ đăng nhập.</p>
            </ActionArea>
          </aside>
        </PageColumns>
      ) : (
        <>
          <section aria-labelledby="home-title" className="space-y-2">
            <h1 id="home-title" className="text-2xl font-bold text-primary sm:text-[2rem]">Hôm nay, bạn cần làm gì?</h1>
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{email ? "Xin chào, " + email : "Chào bạn, hãy xem hợp đồng hoặc bắt đầu với một căn phòng."}</p>
          </section>
          <PageColumns>
            <div className="space-y-8">
              <section aria-labelledby="my-deals-title" className="space-y-3">
                <h2 id="my-deals-title" className="text-xl font-bold">Tiếp tục với hợp đồng</h2>
                <Entry href="/deals" icon={FileText} title="Hợp đồng của tôi" text="Xem phòng bạn thuê, phòng bạn cho thuê và việc cần làm trong từng hợp đồng." />
                {jurorEntry}
              </section>
              <section aria-label="Bắt đầu với một căn phòng" className="space-y-4 border-t pt-6">
                <fieldset className="min-w-0 space-y-4">
                  <legend className="text-xl font-bold">Bắt đầu với một căn phòng</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <RoleChoice role="tenant" active={role === "tenant"} onChange={onRoleChange} title="Tôi thuê phòng" text="Xem phòng trống và điều khoản trước khi gửi cọc." />
                    <RoleChoice role="landlord" active={role === "landlord"} onChange={onRoleChange} title="Tôi cho thuê" text="Đăng phòng, đặt tiền cọc và bảng giá sửa chữa." />
                  </div>
                </fieldset>
                <p className="text-sm text-muted-foreground">Một tài khoản dùng được cả hai vai. Bạn có thể đổi lựa chọn bất cứ lúc nào.</p>
              </section>
            </div>
            <aside aria-labelledby="account-title" className="space-y-4 border-t pt-6 lg:self-start lg:rounded-2xl lg:border lg:p-6">
              <h2 id="account-title" className="text-lg font-bold">Ví và tiền thử nghiệm</h2>
              <TestnetNote />
              <div className="space-y-2 [&_button]:min-h-11 [&_button]:shadow-none">
                <p className="text-sm text-muted-foreground">Địa chỉ ví của bạn</p>
                {wallet}
              </div>
              <p className="text-sm text-muted-foreground">Cần tiền thử để gửi cọc hoặc trả phí giao dịch? Nhận tại đây.</p>
              {faucet}
            </aside>
            <ActionArea>
              {role ? (
                <Button asChild size="lg" className="w-full"><Link href={ROLE_HOME[role]}>{role === "tenant" ? "Xem phòng đang trống" : "Đăng phòng mới"} <ArrowRight aria-hidden="true" /></Link></Button>
              ) : <Button size="lg" className="w-full" disabled>Chọn vai trò để tiếp tục</Button>}
            </ActionArea>
          </PageColumns>
        </>
      )}
    </PageShell>
  );
}

function TestnetNote() {
  return <p className="text-sm text-muted-foreground"><strong className="font-semibold text-foreground">Bản thử nghiệm trên Avalanche Fuji.</strong> Chỉ dùng tiền thử, không dùng tiền thật.</p>;
}

function Entry({ href, icon: Icon, title, text }: { href: string; icon: typeof FileText; title: string; text: string }) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 rounded-xl border border-input p-4 transition-colors hover:bg-secondary">
      <Icon className="size-6 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block font-bold text-primary">{title}</span>
        <span className="block text-sm text-muted-foreground">{text}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-primary" aria-hidden="true" />
    </Link>
  );
}

/** Quyền bồi thẩm tiếp tục lấy từ API/contract, không lấy từ lựa chọn vai trò. */
function JurorEntry({ address }: { address: Address }) {
  const { data } = useQuery({ queryKey: ["juror-disputes", address], queryFn: () => fetchJurorDisputes(address), staleTime: 30_000 });
  if (!data?.isJuror) return null;
  const n = data.items.length;
  return <Entry href="/jury" icon={Gavel} title="Bạn là bồi thẩm" text={n > 0 ? n + " vụ đang chờ phiếu của bạn" : "Chưa có vụ nào chờ phiếu"} />;
}

function RoleChoice({ role, active, onChange, title, text }: { role: UiRole; active: boolean; onChange: (role: UiRole) => void; title: string; text: string }) {
  return (
    <label className={cn("flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-secondary", active ? "border-primary bg-secondary" : "border-input")}>
      <input type="radio" name="onboarding-role" value={role} checked={active} onChange={() => onChange(role)} className="mt-1 size-5 shrink-0 accent-primary" />
      <span className="min-w-0 space-y-1"><span className="block font-semibold">{title}</span><span className="block text-sm text-muted-foreground">{text}</span></span>
    </label>
  );
}
