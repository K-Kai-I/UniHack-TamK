"use client";
// Trang tìm trọ (/rooms): danh mục phòng chủ trọ đã đăng, tìm theo từ khóa, lọc giá, sắp xếp.
// Người thuê mở một phòng để chọn ngày dọn vào và gửi yêu cầu thuê (catalog-room.tsx).
import { useEffect, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin, Search, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Illustration } from "@/components/illustration";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { RoomCover } from "@/components/room-cover";
import { isServerError } from "@/lib/client/api";
import { amountToVnd, formatVnd } from "@/lib/client/money";
import { searchRooms, type CatalogRoom, type RoomSort } from "@/lib/client/rooms-api";
import { useVndRate } from "@/lib/client/use-vnd-rate";

const ROOM_GRID = "grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3";
const MAX_CHIPS = 3;
const selectClass = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";

/** Khoảng giá thuê (VND/tháng). */
const PRICE_RANGES: { id: string; label: string; min: number | null; max: number | null }[] = [
  { id: "all", label: "Mọi mức giá", min: null, max: null },
  { id: "u2", label: "Dưới 2 triệu", min: null, max: 2_000_000 },
  { id: "2-4", label: "2 – 4 triệu", min: 2_000_000, max: 4_000_000 },
  { id: "4-6", label: "4 – 6 triệu", min: 4_000_000, max: 6_000_000 },
  { id: "o6", label: "Trên 6 triệu", min: 6_000_000, max: null },
];

export function CatalogList() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [range, setRange] = useState("all");
  const [sort, setSort] = useState<RoomSort>("newest");
  const vndRate = useVndRate();

  // Đợi người dùng gõ xong 0,3 giây mới tìm, đỡ gọi API mỗi phím.
  useEffect(() => {
    const t = setTimeout(() => setQ(text), 300);
    return () => clearTimeout(t);
  }, [text]);

  const r = PRICE_RANGES.find((x) => x.id === range) ?? PRICE_RANGES[0];
  const filtered = q.trim() !== "" || range !== "all";
  const { data, isPending, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["rooms", q, range, sort],
    queryFn: () => searchRooms({ q, minRent: r.min, maxRent: r.max, sort }),
    placeholderData: keepPreviousData,
  });
  const items = data;

  return (
    <PageShell>
      <PageHeader href="/home" backLabel="Về trang chủ" />
      <div className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Tìm phòng trọ</h1>
          <p className="max-w-prose text-muted-foreground">Chọn phòng, chọn ngày dọn vào rồi gửi yêu cầu. Chủ trọ duyệt xong bạn mới cần gửi cọc.</p>
        </div>
      </div>

      <form role="search" className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]" onSubmit={(e) => { e.preventDefault(); setQ(text); }}>
        <div className="relative">
          <label htmlFor="room-q" className="sr-only">Tìm theo tên, địa chỉ, quận</label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="room-q" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tên, địa chỉ, quận… (gõ không dấu cũng được)" className="h-11 pl-9" />
        </div>
        <div>
          <label htmlFor="room-price" className="sr-only">Giá thuê</label>
          <select id="room-price" value={range} onChange={(e) => setRange(e.target.value)} className={selectClass}>
            {PRICE_RANGES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="room-sort" className="sr-only">Sắp xếp</label>
          <select id="room-sort" value={sort} onChange={(e) => setSort(e.target.value as RoomSort)} className={selectClass}>
            <option value="newest">Mới đăng</option>
            <option value="price_asc">Giá thấp → cao</option>
            <option value="price_desc">Giá cao → thấp</option>
          </select>
        </div>
      </form>

      <p role="status" className="mb-5 text-sm text-muted-foreground">
        {isPending ? "Đang tải danh sách phòng…" : items ? `${items.length} phòng${filtered ? " khớp bộ lọc" : ""}` : "Chưa tải được danh sách phòng"}
      </p>

      {isPending && !items && (
        <div className={ROOM_GRID} aria-busy="true" aria-label="Đang tải phòng">
          {[0, 1, 2].map((i) => (
            <div key={i} className="min-w-0 space-y-3" aria-hidden="true">
              <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      )}

      {isError && !items && (
        <div role="alert" className="mx-auto grid max-w-prose justify-items-center gap-3 rounded-2xl bg-muted px-5 py-12 text-center">
          <WifiOff className="size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Không tải được danh sách phòng</h2>
          <p className="text-muted-foreground">{isServerError(error) ? "Máy chủ đang gặp sự cố. Thử lại sau ít phút." : "Kiểm tra kết nối mạng rồi thử lại."}</p>
          <Button onClick={() => void refetch()} disabled={isFetching}>Thử lại</Button>
        </div>
      )}

      {items && items.length === 0 && (
        <div className="mx-auto grid max-w-prose justify-items-center gap-3 rounded-2xl bg-muted px-5 py-12 text-center">
          <Illustration kind="checkin" className="max-w-48" />
          <h2 className="text-lg font-semibold">{filtered ? "Không có phòng khớp bộ lọc" : "Chưa có phòng nào"}</h2>
          <p className="text-muted-foreground">{filtered ? "Thử từ khóa khác hoặc nới khoảng giá." : "Phòng mới sẽ xuất hiện sau khi chủ trọ đăng."}</p>
          {filtered && <Button variant="secondary" onClick={() => { setText(""); setQ(""); setRange("all"); }}>Xóa bộ lọc</Button>}
        </div>
      )}

      {items && items.length > 0 && (
        <ul className={ROOM_GRID} aria-label="Danh sách phòng" aria-busy={isFetching}>
          {items.map((room) => (
            <li key={room.roomId} className="min-w-0">
              <CatalogCard room={room} vndRate={vndRate} imageVersion={dataUpdatedAt} />
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

function CatalogCard({ room, vndRate, imageVersion }: { room: CatalogRoom; vndRate: number; imageVersion: number }) {
  const shown = room.amenities.slice(0, MAX_CHIPS);
  const more = room.amenities.length - shown.length;
  const titleId = `room-${room.roomId}-title`;
  return (
    <Link href={`/rooms/r/${room.roomId}`} aria-labelledby={titleId}
      className="group flex h-full min-w-0 flex-col rounded-2xl border border-border transition-colors hover:border-input">
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
            <dd className="min-w-0 text-lg font-bold text-primary [overflow-wrap:anywhere]">{formatVnd(room.rentVnd)}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <dt className="text-sm text-muted-foreground">Tiền cọc</dt>
            <dd className="min-w-0 font-semibold [overflow-wrap:anywhere]">{formatVnd(amountToVnd(room.depositAmount, vndRate))}</dd>
          </div>
        </dl>
        {shown.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Tiện nghi">
            {shown.map((a, i) => <li key={`${a}-${i}`} className="max-w-full rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground [overflow-wrap:anywhere]">{a}</li>)}
            {more > 0 && <li className="py-1 text-xs text-muted-foreground">Và {more} tiện nghi khác</li>}
          </ul>
        )}
        <p className="mt-1 flex items-center justify-between gap-3 text-sm font-semibold text-primary group-hover:underline">
          Xem phòng và chọn ngày <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
        </p>
      </div>
    </Link>
  );
}
