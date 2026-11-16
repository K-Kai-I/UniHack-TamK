"use client";
// Màn "Chi tiết phòng + Gửi cọc" (docs/user-flow.md GĐ2, P0). Dữ liệu giả từ lib/client/rooms-data.ts.
// Nút "Gửi cọc" mở DepositSheet: ký permit + depositWithPermit (một lần xác nhận trong ví).
import { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Camera, SearchX, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DepositSheet } from "@/components/deposit-sheet";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { RoomCover } from "@/components/room-cover";
import { WalletChip } from "@/components/wallet-chip";
import { fetchDeal, NotFoundError, type DealDetail } from "@/lib/client/rooms-data";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import { formatDate, monthsBetween } from "@/lib/client/date";
import { amountToVnd, formatToken, formatVnd } from "@/lib/client/money";
import type { Amount } from "@/lib/types";

export function RoomDetail({ dealId }: { dealId: string }) {
  const id = /^\d+$/.test(dealId) ? Number(dealId) : null;
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["deal", id],
    queryFn: () => fetchDeal(id!),
    enabled: id !== null,
    retry: (n, e) => !(e instanceof NotFoundError) && n < 2,
  });

  if (id === null || error instanceof NotFoundError) return <NotFound />;

  return (
    <>
      <NetworkBanner />
      <main className="mx-auto min-h-dvh max-w-md px-5 pb-32">
        <PageHeader href="/rooms" backLabel="Về danh sách phòng" title="Chi tiết phòng" />
        {isPending && <DetailSkeleton />}
        {error && !isPending && (
          <div className="mt-8 grid place-items-center gap-3 rounded-2xl bg-muted px-6 py-12 text-center">
            <p className="font-semibold">Không tải được thông tin phòng</p>
            <p className="text-sm text-muted-foreground">Kiểm tra mạng rồi thử lại.</p>
            <Button onClick={() => refetch()}>Thử lại</Button>
          </div>
        )}
        {data && <DetailBody deal={data} />}
      </main>
      {data && <DepositBar deal={data} />}
    </>
  );
}

/** Đổi số tiền sang chuỗi VND theo tỉ giá từ GET /config. */
function useVnd() {
  const rate = useVndRate();
  return (a: Amount) => formatVnd(amountToVnd(a, rate));
}

function DetailBody({ deal }: { deal: DealDetail }) {
  const vnd = useVnd();
  const { terms, onchain } = deal;
  const photoCount = Math.max(deal.listingPhotoUrls.length, terms.listingPhotos.length);
  const months = monthsBetween(terms.dates.moveInDate, terms.dates.leaseEnd);

  return (
    <div className="mt-2 space-y-8">
      {/* Ảnh: vuốt ngang, mỗi ảnh dừng khớp mép */}
      <section aria-label="Ảnh phòng" className="-mx-5">
        <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {Array.from({ length: Math.max(photoCount, 1) }, (_, i) => (
            <li key={i} className="aspect-[4/3] w-[86%] shrink-0 snap-center overflow-hidden rounded-2xl ring-1 ring-foreground/10">
              <RoomCover
                url={deal.listingPhotoUrls[i] ?? null}
                alt={`Ảnh ${i + 1} của phòng`}
                label={photoCount === 0 ? "Chủ trọ chưa đăng ảnh" : `Ảnh ${i + 1}/${photoCount}`}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <DealStatusBadge state={onchain.state} />
        <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-balance text-primary">
          {terms.room.title}
        </h1>
        <p className="text-muted-foreground">{terms.room.address}</p>
        {terms.room.amenities.length > 0 && (
          <ul className="flex flex-wrap gap-2 pt-1">
            {terms.room.amenities.map((a) => (
              <li key={a} className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-primary">
                {a}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="money" className="space-y-3">
        <h2 id="money" className="text-lg font-bold">
          Tiền và thời hạn
        </h2>
        <dl className="divide-y rounded-2xl bg-card ring-1 ring-foreground/10">
          <Row label="Tiền thuê mỗi tháng" value={formatVnd(terms.room.rentVnd)} />
          <Row
            label="Tiền cọc"
            value={vnd(terms.money.depositAmount)}
            sub={formatToken(terms.money.depositAmount)}
            strong
          />
          <Row label="Phí giữ chỗ" value={vnd(terms.money.reserveFeeAmount)} sub={formatToken(terms.money.reserveFeeAmount)} />
          <Row label="Dọn vào" value={formatDate(terms.dates.moveInDate)} />
          <Row label="Hết hạn thuê" value={formatDate(terms.dates.leaseEnd)} sub={`khoảng ${months} tháng`} />
        </dl>
        <p className="text-sm text-muted-foreground">
          Tiền cọc nằm trong smart contract, không ai tự rút được. Nếu bạn không nhận phòng đúng hạn, phí giữ chỗ bị trừ
          khỏi tiền cọc hoàn lại.
        </p>
      </section>

      <section aria-labelledby="positions" className="space-y-3">
        <div className="space-y-1">
          <h2 id="positions" className="text-lg font-bold">
            Vị trí sẽ chụp khi nhận và trả phòng
          </h2>
          <p className="text-sm text-muted-foreground">
            {terms.positions.length} vị trí. Bạn chụp ngay trong app, AI so ảnh trước và sau.
          </p>
        </div>
        <ul className="space-y-3">
          {terms.positions.map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <div className="size-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-foreground/10">
                <RoomCover url={deal.examplePhotoUrls[p.id] ?? null} alt={`Ảnh ví dụ: ${p.name}`} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold">{p.name}</p>
                <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                  <Camera className="mt-0.5 size-4 shrink-0" /> {p.instruction}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="prices" className="space-y-3">
        <div className="space-y-1">
          <h2 id="prices" className="text-lg font-bold">
            Bảng giá sửa chữa
          </h2>
          <p className="text-sm text-muted-foreground">Nếu có hư hỏng, mức trừ được tính theo bảng này.</p>
        </div>
        <ul className="divide-y rounded-2xl bg-card ring-1 ring-foreground/10">
          {terms.priceList.map((it) => (
            <li key={it.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <p className="min-w-0">
                {it.item} <span className="text-sm text-muted-foreground">/ {it.unit}</span>
              </p>
              <p className="shrink-0 font-semibold tabular-nums">{vnd(it.priceAmount)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="landlord" className="space-y-3">
        <h2 id="landlord" className="text-lg font-bold">
          Chủ trọ
        </h2>
        <div className="flex items-center gap-3">
          <WalletChip address={terms.landlord} />
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-success" /> Địa chỉ ví trên chuỗi
          </p>
        </div>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  strong,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">
        <span className={strong ? "text-xl font-extrabold text-primary" : "font-semibold"}>{value}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </dd>
    </div>
  );
}

/** Thanh nút dính đáy: nút "Gửi cọc" chỉ hoạt động khi phòng OPEN và người xem không phải chủ trọ. */
function DepositBar({ deal }: { deal: DealDetail }) {
  const vnd = useVnd();
  const { ready, authenticated, login } = usePrivy();
  const { address } = useAccount();
  const { onchain, terms } = deal;
  const [open, setOpen] = useState(false);

  let content: React.ReactNode;
  if (onchain.state !== "OPEN") {
    content = (
      <p className="py-3 text-center text-sm text-muted-foreground">Phòng này không còn nhận cọc.</p>
    );
  } else if (!ready) {
    content = <Skeleton className="h-14 w-full rounded-xl" />;
  } else if (!authenticated) {
    content = (
      <Button size="lg" className="h-14 w-full text-base" onClick={login}>
        Đăng nhập để gửi cọc
      </Button>
    );
  } else if (address && address.toLowerCase() === onchain.landlord.toLowerCase()) {
    // Contract sẽ revert LandlordCannotRent; chặn sớm ở UI cho khỏi tốn một lần ký.
    content = (
      <Button size="lg" className="h-14 w-full text-base" disabled>
        Đây là phòng của bạn
      </Button>
    );
  } else {
    content = (
      <Button size="lg" className="h-14 w-full text-base" onClick={() => setOpen(true)}>
        Gửi cọc {vnd(terms.money.depositAmount)}
      </Button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto max-w-md px-5 pt-3">{content}</div>
      <DepositSheet deal={deal} open={open} onOpenChange={setOpen} />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mt-2 space-y-6" aria-busy="true">
      <Skeleton className="aspect-[4/3] w-[86%] rounded-2xl" />
      <div className="space-y-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <Skeleton className="h-56 w-full rounded-2xl" />
    </div>
  );
}

function NotFound() {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-5">
      <PageHeader href="/rooms" backLabel="Về danh sách phòng" />
      <div className="mt-8 grid place-items-center gap-3 rounded-2xl bg-muted px-6 py-12 text-center">
        <SearchX className="size-8 text-muted-foreground" />
        <p className="font-semibold">Không tìm thấy phòng này</p>
        <p className="text-sm text-muted-foreground">Phòng có thể đã được gỡ hoặc đường dẫn bị sai.</p>
        <Button asChild>
          <Link href="/rooms">Xem phòng đang trống</Link>
        </Button>
      </div>
    </main>
  );
}
