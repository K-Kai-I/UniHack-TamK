"use client";
// Màn "Phòng đang trống" (docs/user-flow.md GĐ2, P0). Dữ liệu giả từ lib/client/rooms-data.ts.
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { CalendarDays, DoorClosed, MapPin, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { RoomCover } from "@/components/room-cover";
import { fetchOpenListings, MOCK_VND_PER_TOKEN, type ListingItem } from "@/lib/client/rooms-data";
import { formatDayMonth } from "@/lib/client/date";
import { amountToVnd, formatVnd } from "@/lib/client/money";

const MAX_CHIPS = 3;

export function RoomsList() {
  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ["listings", "open"],
    queryFn: fetchOpenListings,
  });

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pb-10">
      <PageHeader href="/" backLabel="Về trang chủ" />

      <div className="mt-2 mb-5 space-y-1">
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-primary">Phòng đang trống</h1>
        <p className="text-muted-foreground" aria-live="polite">
          {data ? (data.length ? `${data.length} phòng sẵn sàng nhận cọc` : "Chưa có phòng nào") : "Đang tải danh sách…"}
        </p>
      </div>

      {isPending && (
        <div className="space-y-5" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-[16/10] w-full rounded-2xl" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="grid place-items-center gap-3 rounded-2xl bg-muted px-6 py-12 text-center">
          <WifiOff className="size-8 text-muted-foreground" />
          <p className="font-semibold">Không tải được danh sách phòng</p>
          <p className="text-sm text-muted-foreground">Kiểm tra mạng rồi thử lại.</p>
          <Button onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "animate-spin" : undefined} /> Thử lại
          </Button>
        </div>
      )}

      {data && data.length === 0 && (
        <div className="grid place-items-center gap-3 rounded-2xl bg-muted px-6 py-12 text-center">
          <DoorClosed className="size-8 text-muted-foreground" />
          <p className="font-semibold">Chưa có phòng trống</p>
          <p className="text-sm text-muted-foreground">Phòng mới sẽ hiện ở đây ngay khi chủ trọ đăng. Quay lại sau nhé.</p>
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="space-y-6">
          {data.map((room, i) => (
            <motion.li
              key={room.dealId}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 5) * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <RoomItem room={room} />
            </motion.li>
          ))}
        </ul>
      )}
    </main>
  );
}

function RoomItem({ room }: { room: ListingItem }) {
  const depositVnd = formatVnd(amountToVnd(room.depositAmount, MOCK_VND_PER_TOKEN));
  const shown = room.amenities.slice(0, MAX_CHIPS);
  const more = room.amenities.length - shown.length;

  return (
    <Link
      href={`/rooms/${room.dealId}`}
      className="group block rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="aspect-[16/10] overflow-hidden rounded-2xl ring-1 ring-foreground/10">
        <RoomCover
          url={room.coverUrl}
          alt={`Ảnh phòng: ${room.title}`}
          className="transition duration-500 group-hover:scale-[1.03] group-active:scale-100"
        />
      </div>

      <div className="mt-3 space-y-2">
        <h2 className="line-clamp-2 text-lg leading-snug font-bold text-balance">{room.title}</h2>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" />
          <span className="line-clamp-1">{room.address}</span>
        </p>

        <div className="flex items-baseline justify-between gap-3 pt-1">
          <p className="tabular-nums">
            <span className="text-xl font-extrabold text-primary">{formatVnd(room.rentVnd)}</span>
            <span className="text-sm text-muted-foreground"> /tháng</span>
          </p>
          <p className="text-sm tabular-nums text-muted-foreground">
            Cọc <b className="font-semibold text-foreground">{depositVnd}</b>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-4" /> Dọn vào {formatDayMonth(room.moveInDate)}
          </span>
          {shown.map((a) => (
            <span key={a} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-primary">
              {a}
            </span>
          ))}
          {more > 0 && <span className="text-xs font-medium text-muted-foreground">+{more}</span>}
        </div>
      </div>
    </Link>
  );
}
