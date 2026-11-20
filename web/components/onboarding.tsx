"use client";
// GĐ0: đăng nhập qua Privy; vai trò chỉ chọn lối đi, không cấp quyền.
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useReadContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { FileText, Gavel, House, Inbox, LogOut, Search, ShieldCheck } from "lucide-react";
import { isAddressEqual, zeroAddress } from "viem";
import { addresses, chain, usdcAbi } from "@/lib/chain";
import { amountToVnd, formatVnd } from "@/lib/client/money";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import { fetchMyDeals, needsMe } from "@/lib/client/my-deals-api";
import { fetchRequests } from "@/lib/client/rooms-api";
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
  const router = useRouter();
  const todo = useTodo(address);

  // /home chỉ dành cho người đã đăng nhập. Hết phiên (bấm Đăng xuất, token hết hạn, đăng xuất ở tab khác)
  // thì về landing "/". Xóa dấu phiên trước để landing không nháy nút "Vào app" từ lần xem trước.
  useEffect(() => {
    if (!ready || authenticated) return;
    delete document.documentElement.dataset.session;
    router.replace("/");
  }, [ready, authenticated, router]);

  return (
    <OnboardingView
      // Chưa có phiên thì giữ khung chờ trong lúc chuyển trang, không vẽ màn đăng nhập cũ của OnboardingView.
      ready={ready && authenticated} authenticated={authenticated}
      email={user?.google?.email ?? user?.email?.address}
      role={role} onRoleChange={setRole} onLogin={login} onLogout={logout}
      wallet={<WalletChip address={address} />} faucet={<FaucetButton />} balance={<TestBalance address={address} />}
      jurorEntry={address ? <JurorEntry address={address} /> : null}
      todo={todo}
    />
  );
}

/** Trang mẫu dùng cùng phần trình bày, không giả phiên đăng nhập sản phẩm. */
export function OnboardingView({ ready, authenticated, email, role, onRoleChange, onLogin, onLogout, wallet, faucet, balance, jurorEntry, todo }: {
  ready: boolean;
  authenticated: boolean;
  email?: string;
  role: UiRole | null;
  onRoleChange: (role: UiRole) => void;
  onLogin: () => void;
  onLogout: () => void;
  wallet: ReactNode;
  faucet: ReactNode;
  balance?: ReactNode;
  jurorEntry?: ReactNode;
  todo?: { deals: number; requests: number } | null;
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
                <Entry href="/deals" icon={FileText} title="Hợp đồng của tôi" text="Xem phòng bạn thuê, phòng bạn cho thuê và việc cần làm trong từng hợp đồng." todo={todo?.deals} />
                <Entry href="/requests" icon={Inbox} title="Yêu cầu thuê" text="Chủ trọ duyệt yêu cầu và ký hợp đồng; người thuê xem yêu cầu đã gửi và đi gửi cọc." todo={todo?.requests} />
                {jurorEntry}
              </section>
              <section aria-label="Bắt đầu với một căn phòng" className="space-y-4 border-t pt-6">
                <h2 className="text-xl font-bold">Bắt đầu với một căn phòng</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <RoleCard role="tenant" active={role === "tenant"} onPick={onRoleChange} icon={Search} title="Tôi thuê phòng" text="Tìm phòng, chọn ngày dọn vào và gửi yêu cầu cho chủ trọ." />
                  <RoleCard role="landlord" active={role === "landlord"} onPick={onRoleChange} icon={House} title="Tôi cho thuê" text="Đăng phòng, đặt tiền cọc và bảng giá; duyệt yêu cầu thuê." />
                </div>
              </section>
            </div>
            <aside aria-labelledby="account-title" className="space-y-4 border-t pt-6 lg:self-start lg:rounded-2xl lg:border lg:p-6">
              <h2 id="account-title" className="text-lg font-bold">Tiền thử của bạn</h2>
              {balance}
              {faucet}
              <TestnetNote />
              {/* Địa chỉ ví chỉ cho người cần đối chiếu trên Snowtrace (dev, giám khảo). */}
              <details className="border-t pt-1 text-sm">
                <summary className="min-h-11 cursor-pointer py-3 font-semibold text-muted-foreground">Chi tiết kỹ thuật</summary>
                <div className="space-y-2 pb-2 [&_button]:min-h-11 [&_button]:shadow-none">
                  <p className="text-muted-foreground">Địa chỉ ví của bạn trên Avalanche Fuji</p>
                  {wallet}
                </div>
              </details>
            </aside>
          </PageColumns>
        </>
      )}
    </PageShell>
  );
}

function TestnetNote() {
  return <p className="text-sm text-muted-foreground"><strong className="font-semibold text-foreground">Bản thử nghiệm trên Avalanche Fuji.</strong> Chỉ dùng tiền thử, không dùng tiền thật.</p>;
}

function Entry({ href, icon: Icon, title, text, todo = 0 }: { href: string; icon: typeof FileText; title: string; text: string; todo?: number }) {
  return (
    <Link href={href} className={cn("flex min-h-14 items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-secondary", todo > 0 ? "border-destructive/40" : "border-input")}>
      <span className="relative shrink-0">
        <Icon className="size-6 text-primary" aria-hidden="true" />
        {todo > 0 && <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-xs font-bold text-white">{todo}</span>}
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block font-bold text-primary">{title}</span>
        {todo > 0
          ? <span className="block text-sm font-semibold text-destructive">{todo} việc đang chờ bạn</span>
          : <span className="block text-sm text-muted-foreground">{text}</span>}
      </span>
    </Link>
  );
}

/**
 * Thông báo trong app (chưa có thông báo đẩy): đếm việc đang chờ người dùng để Home hiện chấm đỏ.
 * Hợp đồng: theo trạng thái + vai (needsMe). Yêu cầu thuê: chủ trọ có yêu cầu chờ duyệt; người thuê được duyệt mà chưa cọc
 * (đã gồm trong "Hợp đồng của tôi" nếu hợp đồng đã lên chuỗi, nên ở đây chỉ đếm yêu cầu chờ duyệt).
 */
function useTodo(address?: Address) {
  const { getAccessToken } = usePrivy();
  const deals = useQuery({
    queryKey: ["home-todo-deals", address],
    queryFn: async () => fetchMyDeals(address as Address, await getAccessToken()),
    enabled: !!address, refetchInterval: 30_000,
  });
  const reqs = useQuery({
    queryKey: ["home-todo-requests", address],
    queryFn: async () => fetchRequests(await getAccessToken()),
    enabled: !!address, refetchInterval: 30_000,
  });
  if (!address) return null;
  const now = Date.now();
  return {
    deals: (deals.data ?? []).filter((d) => needsMe(d, now)).length,
    requests: (reqs.data?.incoming ?? []).filter((r) => r.status === "PENDING").length,
  };
}

/** Quyền bồi thẩm tiếp tục lấy từ API/contract, không lấy từ lựa chọn vai trò. */
function JurorEntry({ address }: { address: Address }) {
  const { data } = useQuery({ queryKey: ["juror-disputes", address], queryFn: () => fetchJurorDisputes(address), staleTime: 30_000 });
  if (!data?.isJuror) return null;
  const n = data.items.length;
  return <Entry href="/jury" icon={Gavel} title="Bạn là bồi thẩm" text={n > 0 ? n + " vụ đang chờ phiếu của bạn" : "Chưa có vụ nào chờ phiếu"} />;
}

/** Chọn vai không tốn tiền và đổi lại được, nên chạm là đi luôn: nhớ vai rồi mở màn của vai đó. */
function RoleCard({ role, active, onPick, icon: Icon, title, text }: { role: UiRole; active: boolean; onPick: (role: UiRole) => void; icon: typeof FileText; title: string; text: string }) {
  return (
    <Link href={ROLE_HOME[role]} onClick={() => onPick(role)}
      className={cn("group flex min-w-0 items-center gap-3 rounded-2xl border p-5 transition-colors hover:border-primary hover:bg-secondary", active ? "border-primary/60" : "border-input")}>
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-primary group-hover:bg-background"><Icon className="size-5" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1 space-y-1"><span className="block font-bold text-primary">{title}</span><span className="block text-sm text-muted-foreground">{text}</span></span>
    </Link>
  );
}

/** Số dư mUSDC đổi ra VND: người dùng cần biết mình có bao nhiêu tiền, không cần địa chỉ ví. */
function TestBalance({ address }: { address?: Address }) {
  const rate = useVndRate();
  const live = !isAddressEqual(addresses.token, zeroAddress);
  const bal = useReadContract({
    address: addresses.token, abi: usdcAbi, functionName: "balanceOf",
    args: address ? [address] : undefined, chainId: chain.id,
    query: { enabled: !!address && live, refetchInterval: 10_000 },
  });
  return (
    <div>
      <p className="text-3xl font-extrabold tracking-tight text-primary tabular-nums">
        {bal.data !== undefined ? formatVnd(amountToVnd(bal.data, rate)) : bal.isError ? "Chưa đọc được" : "…"}
      </p>
      <p className="text-sm text-muted-foreground">Dùng để gửi cọc trong bản thử nghiệm.</p>
    </div>
  );
}
