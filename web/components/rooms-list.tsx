"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, MapPin, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Illustration } from "@/components/illustration";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { RoomCover } from "@/components/room-cover";
import { fetchOpenListings, type ListingItem } from "@/lib/client/rooms-data";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import { formatDate } from "@/lib/client/date";
import { amountToVnd, formatVnd } from "@/lib/client/money";

const MAX_CHIPS = 3;
const ROOM_GRID = "grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3";

export function RoomsList() {
  const { data, isPending, isError, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["listings", "open"],
    queryFn: fetchOpenListings,
  });
  const vndRate = useVndRate();

  return (
    <RoomsListView
      items={data}
      loading={isPending}
      error={isError}
      refreshing={isFetching}
      onRetry={() => { void refetch(); }}
      vndRate={vndRate}
      imageVersion={dataUpdatedAt}
      mock={process.env.NEXT_PUBLIC_MOCK_API !== "0"}
    />
  );
}

/** Cùng một view cho API thật và các trạng thái kiểm tra tại /dev/rooms. */
export function RoomsListView({
  items,
  loading = false,
  error = false,
  refreshing = false,
  onRetry,
  vndRate,
  imageVersion = 0,
  mock = false,
}: {
  items?: ListingItem[];
  loading?: boolean;
  error?: boolean;
  refreshing?: boolean;
  onRetry: () => void;
  vndRate: number;
  imageVersion?: number;
  mock?: boolean;
}) {
  const hasData = items !== undefined;

  return (
    <PageShell>
      <PageHeader href="/" backLabel="Về trang chủ" />
      <div className="mt-4 mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Phòng đang trống</h1>
          <p className="max-w-prose text-muted-foreground">Xem ảnh, tiền cọc và điều khoản trước khi gửi cọc.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/deals">Hợp đồng của tôi</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={onRetry} disabled={refreshing}>
            <RefreshCw aria-hidden="true" className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined} />
            {refreshing && hasData ? "Đang cập nhật…" : "Tải lại"}
          </Button>
        </div>
      </div>

      <p role="status" className="mb-5 text-sm text-muted-foreground">
        {loading ? "Đang tải danh sách phòng…" : hasData ? `${items.length} phòng trong danh sách` : "Chưa tải được danh sách phòng"}
      </p>

      {error && hasData && (
        <div role="alert" className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground">
          <p className="font-semibold">Chưa cập nhật được danh sách</p>
          <p className="mt-1">Đang hiển thị lần tải thành công gần nhất. Phòng có thể đã có người cọc. Kiểm tra mạng rồi bấm Tải lại.</p>
        </div>
      )}

      {loading && !hasData && (
        <div className={ROOM_GRID} aria-busy="true" aria-label="Đang tải phòng">
          {[0, 1, 2].map((i) => (
            <div key={i} className="min-w-0 space-y-3" aria-hidden="true">
              <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      )}

      {error && !hasData && (
        <div role="alert" className="mx-auto grid max-w-prose justify-items-center gap-3 rounded-2xl bg-muted px-5 py-12 text-center">
          <WifiOff className="size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Không tải được danh sách phòng</h2>
          <p className="text-muted-foreground">Kiểm tra kết nối mạng rồi thử lại.</p>
          <Button onClick={onRetry} disabled={refreshing}>
            {refreshing ? "Đang thử lại…" : "Thử lại"}
          </Button>
        </div>
      )}

      {hasData && items.length === 0 && (
        <div className="mx-auto grid max-w-prose justify-items-center gap-3 rounded-2xl bg-muted px-5 py-12 text-center">
          <Illustration kind="checkin" className="max-w-48" />
          <h2 className="text-lg font-semibold">Chưa có phòng trống</h2>
          <p className="text-muted-foreground">Phòng mới sẽ xuất hiện sau khi chủ trọ đăng. Bạn có thể quay lại sau hoặc xem hợp đồng hiện có.</p>
          <Button variant="secondary" asChild><Link href="/deals">Xem hợp đồng của tôi</Link></Button>
        </div>
      )}

      {hasData && items.length > 0 && (
        <ul className={ROOM_GRID} aria-label="Phòng đang trống">
          {items.map((room) => (
            <li key={room.dealId} className="min-w-0">
              <RoomItem room={room} vndRate={vndRate} imageVersion={imageVersion} />
            </li>
          ))}
        </ul>
      )}

      {mock && <p className="mt-8 text-sm text-muted-foreground">Dữ liệu mẫu để xem giao diện, chưa phải phòng cho thuê thực tế.</p>}
    </PageShell>
  );
}

function RoomItem({ room, vndRate, imageVersion }: { room: ListingItem; vndRate: number; imageVersion: number }) {
  const shown = room.amenities.slice(0, MAX_CHIPS);
  const more = room.amenities.length - shown.length;
  const titleId = `room-${room.dealId}-title`;

  return (
    <Link
      href={`/rooms/${room.dealId}`}
      aria-labelledby={titleId}
      className="group flex h-full min-w-0 flex-col rounded-2xl border border-border transition-colors hover:border-input"
    >
      <div className="aspect-[4/3] shrink-0 overflow-hidden rounded-t-2xl border-b border-border bg-muted">
        <RoomCover key={imageVersion} url={room.coverUrl} alt={`Ảnh phòng: ${room.title}`} fit="contain" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h2 id={titleId} className="text-lg leading-normal font-bold break-words [overflow-wrap:anywhere]">{room.title}</h2>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{room.address}</span>
        </p>

        <dl className="mt-auto space-y-2 border-t border-border pt-3 tabular-nums">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <dt className="text-sm text-muted-foreground">Tiền thuê / tháng</dt>
            <dd className="min-w-0 font-semibold [overflow-wrap:anywhere]">{formatVnd(room.rentVnd)}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <dt className="text-sm text-muted-foreground">Tiền cọc</dt>
            <dd className="min-w-0 text-lg font-bold text-primary [overflow-wrap:anywhere]">{formatVnd(amountToVnd(room.depositAmount, vndRate))}</dd>
          </div>
        </dl>

        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>Dọn vào <time dateTime={room.moveInDate}>{formatDate(room.moveInDate)}</time></span>
        </p>
        {shown.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Tiện nghi">
            {shown.map((a, i) => (
              <li key={`${a}-${i}`} className="max-w-full rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground [overflow-wrap:anywhere]">{a}</li>
            ))}
            {more > 0 && <li className="py-1 text-xs text-muted-foreground">Và {more} tiện nghi khác</li>}
          </ul>
        )}
        <p className="mt-1 flex items-center justify-between gap-3 text-sm font-semibold text-primary group-hover:underline">
          Xem phòng và điều khoản <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
        </p>
      </div>
    </Link>
  );
}
