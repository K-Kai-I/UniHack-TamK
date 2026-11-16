"use client";
// Màn "Hợp đồng của tôi" (docs/user-flow.md > Chưa có trong spec #1): mọi hợp đồng ví này là chủ trọ hoặc người thuê.
// Không có thông báo đẩy, nên màn này tải lại khi mở, khi quay lại tab và mỗi 30 giây để thấy trạng thái mới
// (ví dụ: có người vừa cọc). Chạm một hợp đồng để mở màn Chi tiết hợp đồng, nơi có nút hành động.
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { zeroAddress } from "viem";
import { ChevronRight, FileText, Hourglass, Inbox, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { RoomCover } from "@/components/room-cover";
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

  const items = q.data ?? [];
  const live = sortLive(items.filter((d) => !TERMINAL_STATES.includes(d.state)));
  const ended = items.filter((d) => TERMINAL_STATES.includes(d.state)).sort((a, b) => b.dealId - a.dealId);

  let body: React.ReactNode;
  if (!ready || (signedIn && q.isPending)) {
    body = (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  } else if (!signedIn) {
    body = (
      <Empty icon={<FileText className="size-8" />} title="Đăng nhập để xem hợp đồng của bạn">
        <Button onClick={login}>Đăng nhập</Button>
      </Empty>
    );
  } else if (q.error) {
    body = (
      <Empty icon={<Inbox className="size-8" />} title="Không tải được danh sách" text="Kiểm tra mạng rồi thử lại.">
        <Button onClick={() => q.refetch()}>Thử lại</Button>
      </Empty>
    );
  } else if (items.length === 0) {
    body = (
      <Empty
        icon={<Inbox className="size-8" />}
        title="Bạn chưa có hợp đồng nào"
        text="Đăng phòng hoặc gửi cọc một phòng, hợp đồng sẽ hiện ở đây."
      >
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/rooms">Xem phòng trống</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/listings/new">
              <Plus /> Đăng phòng
            </Link>
          </Button>
        </div>
      </Empty>
    );
  } else {
    body = (
      <div className="space-y-8">
        {live.length > 0 && <Group title="Đang diễn ra" items={live} />}
        {ended.length > 0 && <Group title="Đã kết thúc" items={ended} />}
      </div>
    );
  }

  return (
    <>
      <NetworkBanner />
      <main className="mx-auto min-h-dvh max-w-md px-5 pb-16">
        <PageHeader href="/" backLabel="Về trang chủ" title="Hợp đồng của tôi" />
        <section className="mt-2 mb-6 space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-primary">Hợp đồng của tôi</h1>
          <p className="text-muted-foreground">Phòng bạn cho thuê và phòng bạn thuê. Trạng thái đọc từ contract.</p>
        </section>
        {body}
        {DEALS_MOCK && <p className="mt-6 text-xs text-muted-foreground">Dữ liệu giả: vai trò gán thử để xem giao diện.</p>}
      </main>
    </>
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
    <section className="space-y-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title} · {items.length}
      </h2>
      <ul className="space-y-3">
        {items.map((d) => (
          <li key={d.dealId}>
            <DealCard item={d} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function DealCard({ item }: { item: MyDealItem }) {
  const rate = useVndRate();
  const ended = TERMINAL_STATES.includes(item.state);
  const { passed, msLeft } = useCountdown(ended ? null : item.deadline);
  const myTurn = MY_TURN[item.role][item.state];

  return (
    <Link
      href={`/deals/${item.dealId}`}
      className={cn(
        "flex items-center gap-3 rounded-2xl bg-card p-3 ring-1 transition hover:bg-secondary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        myTurn ? "ring-primary/40" : "ring-foreground/10",
      )}
    >
      <div className="size-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <RoomCover url={item.coverUrl} alt={`Ảnh phòng: ${item.title}`} />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <DealStatusBadge state={item.state} />
          <span className="truncate text-xs text-muted-foreground">
            {ROLE_LABEL[item.role]} · #{item.dealId}
          </span>
        </div>
        <p className="truncate font-semibold">{item.title}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
          <span className="tabular-nums">Cọc {formatVnd(amountToVnd(item.depositAmount, rate))}</span>
          {msLeft !== null && (
            <span className={cn("inline-flex items-center gap-1 tabular-nums", passed && "text-destructive")}>
              <Hourglass className="size-3.5" />
              {passed ? "Đã quá hạn" : `Còn ${formatDuration(msLeft)}`}
            </span>
          )}
        </p>
        {myTurn && <p className="text-sm font-semibold text-primary">Đến lượt bạn: {myTurn}</p>}
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
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
    <div className="grid place-items-center gap-3 rounded-2xl bg-muted px-6 py-12 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <p className="font-semibold">{title}</p>
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
      {children}
    </div>
  );
}
