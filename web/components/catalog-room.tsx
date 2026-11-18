"use client";
// Chi tiết một phòng trong danh mục (/rooms/r/:roomId) + form gửi yêu cầu thuê.
// Người thuê chọn ngày dọn vào và số tháng thuê. Chủ trọ duyệt xong mới có hợp đồng trên chuỗi và mới gửi cọc
// (ở /rooms/:dealId, màn cũ). Ngày được khóa vào điều khoản lúc chủ trọ duyệt.
import { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Loader2, MapPin, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { PageColumns, PageShell } from "@/components/page-shell";
import { RoomCover } from "@/components/room-cover";
import { ApiClientError } from "@/lib/client/api";
import { formatDate } from "@/lib/client/date";
import { dateToIso } from "@/lib/client/listing-form";
import { amountToVnd, formatVnd } from "@/lib/client/money";
import { addMonths, fetchCatalogRoom, sendRentalRequest } from "@/lib/client/rooms-api";
import { useVndRate } from "@/lib/client/use-vnd-rate";

const MONTHS = [1, 3, 6, 9, 12, 18, 24];

/** yyyy-mm-dd của ngày mai theo giờ máy: ngày dọn vào sớm nhất (chủ trọ cần thời gian duyệt). */
function tomorrowInput(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA");
}

export function CatalogRoom({ roomId }: { roomId: string }) {
  const vndRate = useVndRate();
  const { data: room, isPending, isError, error } = useQuery({
    queryKey: ["room", roomId],
    queryFn: () => fetchCatalogRoom(roomId),
    retry: (n, e) => !(e instanceof ApiClientError && e.code === "NOT_FOUND") && n < 2,
  });

  if (isPending) return <PageShell><PageHeader href="/rooms" backLabel="Về tìm phòng" /><div className="mt-6 space-y-4" aria-busy="true"><Skeleton className="aspect-[4/3] w-full max-w-xl rounded-2xl" /><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24 w-full" /></div></PageShell>;
  if (isError || !room) {
    const notFound = error instanceof ApiClientError && error.code === "NOT_FOUND";
    return <PageShell size="read"><PageHeader href="/rooms" backLabel="Về tìm phòng" />
      <div role="alert" className="mt-8 grid justify-items-center gap-3 rounded-2xl bg-muted px-5 py-12 text-center">
        <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-lg font-semibold">{notFound ? "Không có phòng này" : "Không tải được phòng"}</h1>
        <Button asChild variant="secondary"><Link href="/rooms">Xem phòng khác</Link></Button>
      </div>
    </PageShell>;
  }

  return <>
    <NetworkBanner />
    <PageShell>
      <PageHeader href="/rooms" backLabel="Về tìm phòng" title="Chi tiết phòng" />
      <PageColumns className="mt-4">
        <div className="space-y-8 [overflow-wrap:anywhere]">
          <section className="space-y-3">
            <h1 className="text-2xl font-bold tracking-tight text-primary">{room.title}</h1>
            <p className="flex items-start gap-2 text-muted-foreground"><MapPin className="mt-1 size-4 shrink-0" aria-hidden="true" />{room.address}</p>
            {room.listingPhotoUrls.length > 0 && <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {room.listingPhotoUrls.map((u, i) => <li key={u} className="overflow-hidden rounded-xl border border-border bg-muted">
                <a href={u} target="_blank" rel="noreferrer" aria-label={`Xem ảnh phòng ${i + 1} đầy đủ (mở thẻ mới)`} className="relative block aspect-[4/3]">
                  <RoomCover url={u} alt={`Ảnh phòng ${i + 1}`} fit="contain" className="absolute inset-0" />
                </a>
              </li>)}
            </ul>}
          </section>

          <section className="space-y-3">
            <h2 className="font-bold">Tiền</h2>
            <dl className="space-y-2 text-sm tabular-nums">
              <Row label="Tiền thuê mỗi tháng" value={formatVnd(room.rentVnd)} />
              <Row label="Tiền cọc cần gửi" value={formatVnd(amountToVnd(room.depositAmount, vndRate))} strong />
              <Row label="Phí giữ chỗ (trong cọc)" value={formatVnd(amountToVnd(room.reserveFeeAmount, vndRate))} />
            </dl>
            <p className="text-sm text-muted-foreground">Phí giữ chỗ nằm trong tiền cọc. Nếu bạn không gửi ảnh nhận phòng tới hạn, chủ trọ nhận phí này, phần còn lại hoàn về bạn.</p>
          </section>

          {room.amenities.length > 0 && <section className="space-y-3">
            <h2 className="font-bold">Tiện nghi</h2>
            <ul className="flex flex-wrap gap-2">{room.amenities.map((a, i) => <li key={`${a}-${i}`} className="rounded-lg bg-secondary px-2.5 py-1 text-sm">{a}</li>)}</ul>
          </section>}

          <section className="space-y-3">
            <h2 className="font-bold">{room.positions.length} vị trí chụp khi nhận và trả phòng</h2>
            <ul className="space-y-2 text-sm">{room.positions.map((p, i) => <li key={p.id}>
              <span className="font-semibold">{i + 1}. {p.name}</span> <span className="text-muted-foreground">· {p.instruction}</span>{" "}
              <a href={p.exampleUrl} target="_blank" rel="noreferrer" className="text-primary underline">Ảnh ví dụ<span className="sr-only">: {p.name} (mở thẻ mới)</span></a>
            </li>)}</ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-bold">Bảng giá sửa chữa</h2>
            <ul className="divide-y text-sm">{room.priceList.map((it) => <li key={it.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2">
              <span>{it.item} <span className="text-muted-foreground">/ {it.unit}</span></span>
              <b className="tabular-nums">{formatVnd(amountToVnd(it.priceAmount, vndRate))}</b>
            </li>)}</ul>
            <p className="text-sm text-muted-foreground">Chỉ dùng để xem xét hư hỏng khi trả phòng, không trừ tiền thuê hay điện nước.</p>
          </section>
        </div>
        <div><RequestForm roomId={room.roomId} landlord={room.landlord} /></div>
      </PageColumns>
    </PageShell>
  </>;
}

/** Khung form bên phải (máy tính) hoặc cuối trang (điện thoại). Không dùng thanh dính đáy vì form khá dài. */
function FormBox({ children }: { children: React.ReactNode }) {
  return <section className="space-y-4 rounded-2xl bg-secondary p-5 lg:sticky lg:top-4">{children}</section>;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex flex-wrap justify-between gap-x-3 gap-y-1"><dt className="text-muted-foreground">{label}</dt><dd className={strong ? "text-lg font-bold text-primary" : "font-semibold"}>{value}</dd></div>;
}

function RequestForm({ roomId, landlord }: { roomId: string; landlord: string }) {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { address } = useAccount();
  const [moveIn, setMoveIn] = useState("");
  const [months, setMonths] = useState(6);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const min = tomorrowInput();
  const leaseEnd = moveIn ? addMonths(moveIn, months) : "";
  const isOwner = !!address && address.toLowerCase() === landlord.toLowerCase();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!moveIn) { setError("Chọn ngày dọn vào."); return; }
    if (moveIn < min) { setError("Ngày dọn vào sớm nhất là ngày mai."); return; }
    setBusy(true); setError(null);
    try {
      const token = await getAccessToken();
      await sendRentalRequest(roomId, { moveInDate: dateToIso(moveIn), leaseEnd: dateToIso(leaseEnd), note: note.trim() || undefined }, token);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Chưa gửi được yêu cầu. Thử lại sau.");
    } finally { setBusy(false); }
  }

  if (sent) return <FormBox>
    <div role="status" className="space-y-3">
      <CheckCircle2 className="size-8 text-success" aria-hidden="true" />
      <p className="font-semibold">Đã gửi yêu cầu thuê</p>
      <p className="text-sm text-muted-foreground">Dọn vào {formatDate(dateToIso(moveIn))}, thuê {months} tháng. Khi chủ trọ duyệt, bạn sẽ thấy nút gửi cọc trong mục “Yêu cầu thuê”.</p>
      <Button asChild className="w-full"><Link href="/requests">Xem yêu cầu của tôi</Link></Button>
    </div>
  </FormBox>;

  return <FormBox>
    <h2 className="flex items-center gap-2 font-bold"><CalendarDays className="size-5" aria-hidden="true" />Gửi yêu cầu thuê</h2>
    {!ready ? <p role="status" className="text-sm text-muted-foreground">Đang tải tài khoản…</p>
      : !authenticated ? <>
        <p className="text-sm text-muted-foreground">Đăng nhập để chọn ngày dọn vào và gửi yêu cầu cho chủ trọ.</p>
        <Button className="w-full" onClick={login}>Đăng nhập</Button>
      </> : isOwner ? <>
        <p className="text-sm text-muted-foreground">Đây là phòng của bạn. Yêu cầu của người thuê nằm trong mục “Yêu cầu thuê”.</p>
        <Button asChild className="w-full"><Link href="/requests">Xem yêu cầu thuê</Link></Button>
      </> : <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="req-movein" className="text-sm font-medium">Ngày dọn vào</label>
          <Input id="req-movein" type="date" min={min} value={moveIn} onChange={(e) => { setMoveIn(e.target.value); setError(null); }} className="h-11" aria-invalid={!!error && !moveIn} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="req-months" className="text-sm font-medium">Thời gian thuê</label>
          <select id="req-months" value={months} onChange={(e) => setMonths(Number(e.target.value))} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
            {MONTHS.map((m) => <option key={m} value={m}>{m} tháng</option>)}
          </select>
          {leaseEnd && <p className="text-sm text-muted-foreground">Hết hạn thuê: {formatDate(dateToIso(leaseEnd))}</p>}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="req-note" className="text-sm font-medium">Lời nhắn cho chủ trọ <span className="font-normal text-muted-foreground">(không bắt buộc)</span></label>
          <textarea id="req-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} rows={3}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="Ví dụ: em là sinh viên, ở một mình" />
        </div>
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}{busy ? "Đang gửi…" : "Gửi yêu cầu"}
        </Button>
        <p className="text-xs text-muted-foreground">Chưa mất tiền. Chủ trọ duyệt xong, ngày bạn chọn được khóa vào hợp đồng và bạn mới gửi cọc.</p>
      </form>}
  </FormBox>;
}
