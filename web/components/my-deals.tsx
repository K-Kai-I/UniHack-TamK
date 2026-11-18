"use client";
// Màn "Hợp đồng của tôi" (docs/user-flow.md > Chưa có trong spec #1): mọi hợp đồng ví này là chủ trọ hoặc người thuê.
// Không có thông báo đẩy, nên màn này tải lại khi mở, khi quay lại tab và mỗi 30 giây để thấy trạng thái mới
// (ví dụ: có người vừa cọc). Chạm một hợp đồng để mở màn Chi tiết hợp đồng, nơi có nút hành động.
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { zeroAddress } from "viem";
import { ChevronRight, FileText, Hourglass, Inbox, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { Illustration } from "@/components/illustration";
import { RoomCover } from "@/components/room-cover";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { formatDateTime } from "@/lib/client/date";
import { TERMINAL_STATES } from "@/lib/client/deal-actions";
import { DEALS_MOCK } from "@/lib/client/deals-data";
import { amountToVnd, formatVnd } from "@/lib/client/money";
import { fetchMyDeals, type MyDealItem } from "@/lib/client/my-deals-api";
import { formatDuration, useCountdown } from "@/lib/client/use-countdown";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import type { Address, DealState } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Bước đang chờ CHÍNH ví này (bảng "Nút trên app theo trạng thái"). Chỉ dựa vào trạng thái + vai trò có trong
 * danh sách; RESERVED không đưa vào vì cần biết đã có ảnh nhận phòng chưa (màn chi tiết mới có).
 */
const MY_TURN: Record<MyDealItem["role"], Partial<Record<DealState, string>>> = {
  tenant: {
    ABANDON_REPORTED: "Xác nhận bạn vẫn đang ở",
    PROPOSED: "Trả lời mức trừ",
  },
  landlord: {
    MISMATCH_REPORTED: "Xem báo cáo phòng sai mô tả",
    CHECKED_OUT: "Đề xuất mức trừ",
  },
};

const ROLE_LABEL = { landlord: "Bạn cho thuê", tenant: "Bạn thuê" } as const;

/** Nhãn tiền khi contract KHÔNG giữ tiền: chưa ai cọc, đã gỡ, hoặc đã chia/hoàn. */
const MONEY_LABEL: Partial<Record<DealState, string>> = {
  OPEN: "Tiền cọc yêu cầu",
  CANCELLED: "Tiền cọc",
  SETTLED: "Cọc ban đầu (đã chia)",
  REFUNDED: "Cọc ban đầu (đã hoàn)",
};

export function MyDeals() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { address } = useAccount();
  const signedIn = DEALS_MOCK || (authenticated && !!address);
  const q = useQuery({
    queryKey: ["my-deals", address],
    queryFn: async () => fetchMyDeals((address ?? zeroAddress) as Address, await getAccessToken()),
    enabled: ready && signedIn,
    refetchInterval: 30_000,
  });

  return (
    <>
      <NetworkBanner />
      <MyDealsView
        status={!ready ? "loading" : !signedIn ? (authenticated ? "wallet-pending" : "login") : q.isPending ? "loading" : "ready"}
        items={q.data ?? []}
        error={!!q.error}
        refreshing={q.isFetching}
        onLogin={login}
        onRetry={() => { void q.refetch(); }}
        mock={DEALS_MOCK}
      />
    </>
  );
}

/** Phần trình bày dùng chung với trang mẫu; quyền và dữ liệu thật do MyDeals phụ trách. */
export function MyDealsView({
  status, items, error = false, refreshing = false, onLogin, onRetry, mock = false,
}: {
  status: "loading" | "wallet-pending" | "login" | "ready";
  items: MyDealItem[];
  error?: boolean;
  refreshing?: boolean;
  onLogin: () => void;
  onRetry: () => void;
  mock?: boolean;
}) {
  const live = sortLive(items.filter((d) => !TERMINAL_STATES.includes(d.state)));
  const ended = items.filter((d) => TERMINAL_STATES.includes(d.state)).sort((a, b) => b.dealId - a.dealId);

  let body: React.ReactNode;
  if (status === "loading" || status === "wallet-pending") {
    body = (
      <div className="space-y-3" aria-busy="true">
        <p role="status" className="text-sm text-muted-foreground">
          {status === "wallet-pending" ? "Đang kết nối ví để tìm hợp đồng của bạn…" : "Đang tải hợp đồng…"}
        </p>
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 w-full rounded-2xl lg:h-32" />)}
      </div>
    );
  } else if (status === "login") {
    body = (
      <Empty icon={<FileText className="size-8" />} title="Đăng nhập để xem hợp đồng của bạn" text="Các phòng bạn thuê và cho thuê cùng xuất hiện tại đây.">
        <Button size="lg" onClick={onLogin}>Đăng nhập</Button>
      </Empty>
    );
  } else if (error && items.length === 0) {
    body = (
      <Empty icon={<Inbox className="size-8" />} title="Không tải được danh sách" text="Kiểm tra mạng rồi thử lại.">
        <Button onClick={onRetry} disabled={refreshing}>{refreshing ? "Đang thử lại…" : "Thử lại"}</Button>
      </Empty>
    );
  } else if (items.length === 0) {
    body = (
      <Empty icon={<Illustration kind="checkin" className="max-w-48" />} title="Bạn chưa có hợp đồng nào" text="Khi bạn gửi cọc hoặc đăng phòng, hợp đồng sẽ hiện ở đây.">
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild><Link href="/rooms">Xem phòng trống</Link></Button>
          <Button asChild variant="outline"><Link href="/listings/new"><Plus aria-hidden="true" /> Đăng phòng</Link></Button>
        </div>
      </Empty>
    );
  } else {
    body = (
      <div className="space-y-8">
        {error && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning bg-warning/15 p-4 text-warning-foreground">
            <p className="max-w-prose text-sm">Chưa cập nhật được trạng thái mới. Danh sách dưới đây là lần tải thành công gần nhất.</p>
            <Button variant="outline" onClick={onRetry} disabled={refreshing}>{refreshing ? "Đang thử lại…" : "Thử lại"}</Button>
          </div>
        )}
        {live.length > 0 && <Group title="Đang diễn ra" items={live} />}
        {ended.length > 0 && <Group title="Đã kết thúc" items={ended} />}
      </div>
    );
  }

  return (
    <PageShell className="pb-16">
      <PageHeader href="/" backLabel="Về trang chủ" />
      <div className="mt-4 mb-8 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-primary">Hợp đồng của tôi</h1>
          <p className="max-w-prose text-muted-foreground">Phòng bạn thuê và cho thuê, cùng việc cần làm tiếp theo.</p>
        </div>
        {status === "ready" && items.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline"><Link href="/rooms">Xem phòng trống</Link></Button>
            <Button asChild variant="secondary"><Link href="/listings/new"><Plus aria-hidden="true" /> Đăng phòng</Link></Button>
            <Button variant="ghost" onClick={onRetry} disabled={refreshing}>
              <RefreshCw className={refreshing ? "animate-spin" : undefined} aria-hidden="true" />
              {refreshing ? "Đang cập nhật…" : "Tải lại"}
            </Button>
          </div>
        )}
      </div>
      {body}
      {mock && <p className="mt-6 text-sm text-muted-foreground">Dữ liệu mẫu · vai trò gán thử để xem giao diện.</p>}
    </PageShell>
  );
}

/** Việc đến lượt mình lên đầu, rồi hạn chót gần nhất, rồi deal mới nhất. */
function sortLive(list: MyDealItem[]): MyDealItem[] {
  const turn = (d: MyDealItem) => (MY_TURN[d.role][d.state] ? 0 : 1);
  const due = (d: MyDealItem) => (d.deadline ? Date.parse(d.deadline) : Number.POSITIVE_INFINITY);
  return [...list].sort((a, b) => turn(a) - turn(b) || due(a) - due(b) || b.dealId - a.dealId);
}

function Group({ title, items }: { title: string; items: MyDealItem[] }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <h2 className="text-lg font-bold">{title} <span className="font-normal text-muted-foreground">({items.length})</span></h2>
      <ul className="space-y-3 lg:space-y-0 lg:divide-y lg:border-y lg:border-border">
        {items.map((d) => <li key={d.dealId}><DealCard item={d} /></li>)}
      </ul>
    </section>
  );
}

function DealCard({ item }: { item: MyDealItem }) {
  const rate = useVndRate();
  const ended = TERMINAL_STATES.includes(item.state);
  const { passed, msLeft } = useCountdown(ended ? null : item.deadline);
  const myTurn = MY_TURN[item.role][item.state];
  const next = ended ? "Xem hợp đồng đã kết thúc" : passed ? "Xem chi tiết để kiểm tra xử lý quá hạn" : myTurn;

  return (
    <Link
      href={`/deals/${item.dealId}`}
      className={cn(
        "grid min-w-0 gap-4 rounded-2xl border bg-card p-4 transition-colors hover:bg-secondary/50 lg:grid-cols-[minmax(0,1fr)_160px_280px_20px] lg:items-center lg:gap-6 lg:rounded-none lg:border-0 lg:py-5",
        myTurn ? "border-primary/40" : "border-border",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <DealCover key={item.coverUrl} url={item.coverUrl} title={item.title} />
        <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
          <h3 className="font-bold">{item.title}</h3>
          <p className="text-sm text-muted-foreground">{item.address}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <DealStatusBadge state={item.state} />
            <span className="text-sm text-muted-foreground">{ROLE_LABEL[item.role]} · #{item.dealId}</span>
          </div>
        </div>
      </div>
      <dl className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-border pt-3 lg:block lg:border-0 lg:pt-0">
        {/* Chỉ trạng thái đang giữ tiền mới ghi "trong hợp đồng" (DESIGN.md > Mốc của căn phòng). */}
        <dt className="text-sm text-muted-foreground">{MONEY_LABEL[item.state] ?? "Cọc trong hợp đồng"}</dt>
        {item.state === "CANCELLED" ? (
          <dd className="font-semibold text-muted-foreground">Không có tiền nào được giữ</dd>
        ) : (
          <dd className={cn("font-bold tabular-nums [overflow-wrap:anywhere]", ended ? "text-foreground" : "text-primary")}>
            {formatVnd(amountToVnd(item.depositAmount, rate))}
          </dd>
        )}
      </dl>
      <div className="min-w-0 space-y-2 text-sm [overflow-wrap:anywhere]">
        {myTurn && !passed && !ended && <p className="font-semibold text-primary">Đến lượt bạn: {myTurn}</p>}
        {!next && <p className="text-muted-foreground">{item.state === "RESERVED" ? "Xem chi tiết để biết bước nhận phòng" : "Xem tiến độ trong hợp đồng"}</p>}
        {msLeft !== null && item.deadline && (
          <div className="space-y-1">
            <p className={cn("flex items-start gap-1.5 font-medium tabular-nums", passed ? "text-destructive" : "text-muted-foreground")}>
              <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {passed ? "Đã quá hạn · chưa xác nhận xử lý" : `Còn ${formatDuration(msLeft)}`}
            </p>
            <p className="text-muted-foreground">Hạn: <time dateTime={item.deadline}>{formatDateTime(item.deadline)}</time> (giờ VN)</p>
          </div>
        )}
        <p className="font-semibold text-primary">{ended || passed ? next : "Xem hợp đồng"}<ChevronRight className="ml-1 inline size-4 lg:hidden" aria-hidden="true" /></p>
      </div>
      <ChevronRight className="hidden size-5 text-muted-foreground lg:block" aria-hidden="true" />
    </Link>
  );
}

/** Cùng fallback với ảnh phòng khác; khung nhỏ giữ thông báo qua tên truy cập. */
function DealCover({ url, title }: { url: string | null; title: string }) {
  return (
    <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted">
      <RoomCover url={url} alt={`Ảnh phòng: ${title}`} />
    </div>
  );
}

function Empty({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  text?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center gap-4 rounded-2xl bg-muted px-4 py-12 text-center sm:px-8">
      <span className="text-muted-foreground">{icon}</span>
      <p className="font-semibold">{title}</p>
      {text && <p className="max-w-prose text-sm text-muted-foreground">{text}</p>}
      {children}
    </div>
  );
}
