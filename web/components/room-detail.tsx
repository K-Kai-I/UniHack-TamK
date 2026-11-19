"use client";
// Chi tiết phòng (docs/user-flow.md GĐ2). Xác nhận giao dịch vẫn dùng DepositSheet.
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Camera, RefreshCw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionArea } from "@/components/action-area";
import { DepositSheet } from "@/components/deposit-sheet";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { PageColumns, PageShell } from "@/components/page-shell";
import { RoomCover } from "@/components/room-cover";
import { WalletChip } from "@/components/wallet-chip";
import { isServerError } from "@/lib/client/api";
import { fetchDeal, NotFoundError, type DealDetail } from "@/lib/client/rooms-data";
import { useAppConfig } from "@/lib/client/use-config";
import { useCountdown } from "@/lib/client/use-countdown";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import { formatDateTime, monthsBetween } from "@/lib/client/date";
import { amountToVnd, formatToken, formatVnd } from "@/lib/client/money";
import type { Amount } from "@/lib/types";

export function RoomDetail({ dealId }: { dealId: string }) {
  const id = /^\d+$/.test(dealId) && Number.isSafeInteger(Number(dealId)) ? Number(dealId) : null;
  const query = useQuery({
    queryKey: ["deal", id],
    queryFn: () => fetchDeal(id!),
    enabled: id !== null,
    retry: (n, e) => !(e instanceof NotFoundError) && n < 2,
  });
  const config = useAppConfig();
  const queryClient = useQueryClient();
  // Theo contract: hạn cọc/ảnh nhận phòng = moveInDate + moveInGrace từ GET /config.
  const deadline = query.data && config
    ? new Date(Date.parse(query.data.terms.dates.moveInDate) + config.timeouts.moveInGrace * 1000).toISOString()
    : null;
  const { passed } = useCountdown(deadline);
  // useCountdown giữ mốc now lúc mount. Dữ liệu có thể tới sau hạn trước khi timer được tạo.
  const expired = passed || (deadline !== null && Date.now() >= Date.parse(deadline));
  const unavailable = query.isFetching || !!query.error || !deadline || expired;

  return (
    <>
      <NetworkBanner />
      <RoomDetailView
        deal={query.data}
        loading={query.isPending}
        fetching={query.isFetching}
        error={!!query.error}
        serverError={isServerError(query.error)}
        notFound={id === null || query.error instanceof NotFoundError}
        onRetry={() => { void query.refetch(); void queryClient.invalidateQueries({ queryKey: ["config"] }); }}
        imageVersion={query.dataUpdatedAt}
        deadline={deadline}
        expired={expired}
        mock={process.env.NEXT_PUBLIC_MOCK_API !== "0"}
        action={query.data ? <DepositAction deal={query.data} unavailable={unavailable} expired={expired} /> : undefined}
      />
    </>
  );
}

/** Cùng view cho route thật và trang mẫu; trang mẫu không gọi ví hoặc gửi giao dịch. */
export function RoomDetailView({ deal, loading = false, fetching = false, error = false, serverError = false, notFound = false, onRetry, deadline = null, expired = false, mock = false, action, imageVersion = 0 }: {
  deal?: DealDetail; loading?: boolean; fetching?: boolean; error?: boolean; serverError?: boolean; notFound?: boolean;
  onRetry: () => void; deadline?: string | null; expired?: boolean; mock?: boolean; action?: ReactNode; imageVersion?: number;
}) {
  const rate = useVndRate();
  const vnd = (amount: Amount) => formatVnd(amountToVnd(amount, rate));
  const title = notFound ? "Không tìm thấy phòng này" : "Không tải được thông tin phòng";

  return (
    <PageShell size={notFound || (!deal && error) ? "read" : "wide"}>
      <PageHeader href="/rooms" backLabel="Về danh sách phòng" title="Chi tiết phòng" />
      {notFound ? (
        <section className="my-8 space-y-4 rounded-2xl bg-muted p-6 text-center">
          <SearchX className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-muted-foreground">Phòng có thể đã được gỡ hoặc đường dẫn bị sai.</p>
          <Button asChild><Link href="/rooms">Xem phòng đang trống</Link></Button>
        </section>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" role="status">
              {fetching ? "Đang tải thông tin phòng…" : mock ? "Dữ liệu mẫu · chưa phải phòng thực tế" : "Thông tin phòng và điều khoản"}
            </p>
            <Button variant="outline" onClick={onRetry} disabled={fetching}>
              <RefreshCw className="size-4" aria-hidden="true" />{fetching ? "Đang tải…" : "Tải lại"}
            </Button>
          </div>
          {error && (
            <section role="alert" className="mb-6 space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              {deal ? <h2 className="font-bold">Chưa cập nhật được thông tin phòng</h2> : <h1 className="text-xl font-bold">{title}</h1>}
              <p className="text-sm">{deal ? "Đang hiển thị lần tải thành công gần nhất. Phòng có thể đã có người cọc. Tải lại trước khi tiếp tục." : serverError ? "Máy chủ đang gặp sự cố, không phải lỗi mạng của bạn. Thử lại sau ít phút." : "Kiểm tra kết nối mạng rồi thử lại."}</p>
              <Button variant="outline" onClick={onRetry} disabled={fetching}>{fetching ? "Đang thử lại…" : "Thử lại"}</Button>
            </section>
          )}
          {!deal && loading && !error && <DetailSkeleton />}
          {deal && (
            <>
              <header className="mb-6 space-y-3 [overflow-wrap:anywhere]">
                <h1 className="max-w-[36ch] text-2xl leading-snug font-extrabold tracking-tight text-primary sm:text-3xl">{deal.terms.room.title}</h1>
                <p className="max-w-[75ch] text-muted-foreground">{deal.terms.room.address}</p>
                <DealStatusBadge state={deal.onchain.state} />
              </header>
              <PageColumns className="lg:grid-rows-[auto_1fr] lg:gap-y-4">
                <section aria-labelledby="money" className="space-y-4 rounded-2xl bg-secondary p-5 [overflow-wrap:anywhere] lg:col-start-2 lg:row-start-1">
                  <h2 id="money" className="text-lg font-bold">Tiền và thời hạn</h2>
                  <dl className="divide-y divide-border">
                    <Row label="Tiền thuê mỗi tháng" value={formatVnd(deal.terms.room.rentVnd)} />
                    <Row label="Tiền cọc cần gửi" value={vnd(deal.onchain.deposit)} strong />
                    <Row label="Phí giữ chỗ (trong cọc)" value={vnd(deal.onchain.reserveFee)} />
                    <Row label="Dọn vào" value={formatDateTime(deal.terms.dates.moveInDate)} />
                    <Row label="Hết hạn thuê" value={formatDateTime(deal.terms.dates.leaseEnd)} sub={`Khoảng ${monthsBetween(deal.terms.dates.moveInDate, deal.terms.dates.leaseEnd)} tháng`} />
                  </dl>
                  <div className="space-y-2 border-t pt-4 text-sm">
                    <p className="font-semibold">Phí giữ chỗ đã nằm trong tiền cọc, không cộng thêm.</p>
                    <p>{deadline ? <>Hạn gửi cọc và ảnh nhận phòng: <time className="font-semibold tabular-nums" dateTime={deadline}>{formatDateTime(deadline)}</time> (giờ Việt Nam).</> : "Chưa tải được hạn gửi cọc và ảnh nhận phòng. Cần tải cấu hình trước khi tiếp tục."}</p>
                    <p>Nếu không gửi ảnh nhận phòng trước hạn, tiền cọc được hoàn lại sau khi trừ phí giữ chỗ và xử lý quá hạn.</p>
                    {expired && deal.onchain.state === "OPEN" && <p className="font-semibold text-destructive">Đã qua hạn nhận cọc. Trạng thái phòng chưa được cập nhật thành đã đóng.</p>}
                  </div>
                  <details className="border-t pt-3 text-sm">
                    <summary className="min-h-11 cursor-pointer py-2 font-semibold">Đơn vị thử nghiệm</summary>
                    <p className="pb-2">Cọc: {formatToken(deal.onchain.deposit)}. Phí giữ chỗ: {formatToken(deal.onchain.reserveFee)}. Số VND là quy đổi để hiển thị.</p>
                  </details>
                </section>
                <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-span-2 lg:row-start-1">
                  <RoomGallery key={deal.dealId} deal={deal} imageVersion={imageVersion} />
                  <section aria-labelledby="amenities" className="space-y-3">
                    <h2 id="amenities" className="text-lg font-bold">Tiện nghi của phòng</h2>
                    {deal.terms.room.amenities.length ? <ul className="flex flex-wrap gap-2 [overflow-wrap:anywhere]">{deal.terms.room.amenities.map((a, i) => <li key={i} className="max-w-full rounded-lg bg-muted px-3 py-2 text-sm">{a}</li>)}</ul> : <p className="text-sm text-muted-foreground">Chủ trọ chưa ghi tiện nghi.</p>}
                  </section>
                  <section aria-labelledby="positions" className="space-y-4">
                    <div className="space-y-2">
                      <h2 id="positions" className="text-lg font-bold">Vị trí chụp khi nhận và trả phòng</h2>
                      <p className="max-w-[70ch] text-sm text-muted-foreground">{deal.terms.positions.length} vị trí. Chụp bằng camera trong app ở cùng góc khi nhận và trả phòng. AI so ảnh để hỗ trợ xem xét hư hỏng.</p>
                    </div>
                    <ul className="divide-y border-y">
                      {deal.terms.positions.map((p) => (
                        <li key={p.id} className="flex items-start gap-4 py-4 [overflow-wrap:anywhere]">
                          <div className="size-24 shrink-0 overflow-hidden rounded-xl border"><RoomCover key={imageVersion} url={deal.examplePhotoUrls[p.id] ?? null} alt={`Ảnh ví dụ: ${p.name}`} fit="contain" /></div>
                          <div className="min-w-0 space-y-1">
                            <h3 className="font-semibold">{p.name}</h3>
                            <p className="flex items-start gap-2 text-sm text-muted-foreground"><Camera className="mt-1 size-4 shrink-0" aria-hidden="true" />{p.instruction}</p>
                            {deal.examplePhotoUrls[p.id] && <OriginalLink url={deal.examplePhotoUrls[p.id]!} label={`Xem ảnh ví dụ: ${p.name}`} />}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section aria-labelledby="prices" className="space-y-3">
                    <h2 id="prices" className="text-lg font-bold">Bảng giá sửa chữa</h2>
                    <p className="max-w-[70ch] text-sm text-muted-foreground">Chỉ xem xét hư hỏng, không trừ tiền thuê, điện hay nước. Mức trừ dựa trên hạng mục và số lượng; kết quả AI là căn cứ tham khảo.</p>
                    <dl className="divide-y border-y">
                      {deal.terms.priceList.map((it) => <Row key={it.id} label={`${it.item} / ${it.unit}`} value={vnd(it.priceAmount)} />)}
                    </dl>
                  </section>
                  <section aria-labelledby="landlord" className="space-y-3 border-t pt-6">
                    <h2 id="landlord" className="text-lg font-bold">Thông tin chủ trọ</h2>
                    <p className="text-sm text-muted-foreground">Địa chỉ ví ghi trên hợp đồng. Thông tin này không xác minh danh tính chủ trọ.</p>
                    <div className="flex min-h-11 items-center"><WalletChip address={deal.onchain.landlord} /></div>
                  </section>
                </div>
                <div className="lg:col-start-2 lg:row-start-2">
                  <ActionArea>
                    <p className="text-sm font-semibold tabular-nums">Cọc {vnd(deal.onchain.deposit)} · Phí giữ chỗ {vnd(deal.onchain.reserveFee)} đã gồm trong cọc.</p>
                    <p className="text-sm">{deadline ? <>Hạn gửi cọc và ảnh nhận phòng: <time className="font-semibold tabular-nums" dateTime={deadline}>{formatDateTime(deadline)}</time> (giờ Việt Nam).</> : "Chưa tải được hạn. Cần tải lại cấu hình trước khi gửi cọc."}</p>
                    {action}
                  </ActionArea>
                </div>
              </PageColumns>
            </>
          )}
        </>
      )}
    </PageShell>
  );
}

function Row({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 [overflow-wrap:anywhere]">
    <dt className="min-w-0 text-sm text-muted-foreground">{label}</dt>
    <dd className="ml-auto min-w-0 max-w-full text-right tabular-nums"><span className={strong ? "text-2xl font-extrabold text-primary" : "font-semibold"}>{value}</span>{sub && <span className="block text-sm text-muted-foreground">{sub}</span>}</dd>
  </div>;
}

function OriginalLink({ url, label }: { url: string; label: string }) {
  return <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 py-2 text-sm font-semibold text-primary underline underline-offset-4">{label}<ArrowUpRight className="size-4 shrink-0" aria-hidden="true" /><span className="sr-only"> (mở thẻ mới)</span></a>;
}

function RoomGallery({ deal, imageVersion }: { deal: DealDetail; imageVersion: number }) {
  const [selected, setSelected] = useState(0);
  const count = Math.max(deal.listingPhotoUrls.length, deal.terms.listingPhotos.length);
  const index = Math.min(selected, Math.max(count - 1, 0));
  const url = deal.listingPhotoUrls[index];
  return <section aria-labelledby="photos" className="space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="photos" className="text-lg font-bold">Ảnh đăng phòng</h2><p className="text-sm text-muted-foreground" aria-live="polite">{count ? `Ảnh ${index + 1} / ${count}` : "Chưa có ảnh đăng phòng"}</p></div>
    <div className="aspect-[4/3] overflow-hidden rounded-2xl border bg-muted"><RoomCover key={imageVersion} url={url ?? null} alt={`Ảnh đăng phòng ${index + 1}: ${deal.terms.room.title}`} fit="contain" label={count ? "Chưa tải được ảnh đăng phòng" : "Chủ trọ chưa đăng ảnh"} /></div>
    {count > 1 && <ul className="flex flex-wrap gap-2" aria-label="Chọn ảnh đăng phòng">{Array.from({ length: count }, (_, i) => <li key={i}><button type="button" aria-label={`Xem ảnh đăng phòng ${i + 1}`} aria-pressed={index === i} onClick={() => setSelected(i)} className="min-h-11 min-w-11 rounded-lg border border-input px-3 py-2 text-sm font-semibold tabular-nums aria-pressed:border-primary aria-pressed:bg-secondary aria-pressed:text-primary">{i + 1}</button></li>)}</ul>}
    {url && <OriginalLink url={url} label={`Xem ảnh đăng phòng ${index + 1} đầy đủ`} />}
    <p className="text-sm text-muted-foreground">Ảnh do chủ trọ đăng, dùng để xem mô tả phòng. Ảnh nhận và trả phòng sẽ được chụp riêng trong app.</p>
  </section>;
}

function DepositAction({ deal, unavailable, expired }: { deal: DealDetail; unavailable: boolean; expired: boolean }) {
  const { ready, authenticated, login } = usePrivy();
  const { address } = useAccount();
  const [open, setOpen] = useState(false);
  const rate = useVndRate();
  const owner = address?.toLowerCase() === deal.onchain.landlord.toLowerCase();
  const viewer = !ready ? "loading" : !authenticated ? "signed-out" : owner ? "owner" : !address ? "wallet-pending" : "tenant";
  return <>
    <RoomDepositActionView deal={deal} unavailable={unavailable} expired={expired} viewer={viewer} onLogin={login} onDeposit={() => setOpen(true)} rate={rate} />
    <DepositSheet deal={deal} open={open} onOpenChange={setOpen} unavailable={unavailable} />
  </>;
}

export function RoomDepositActionView({ deal, unavailable, expired, viewer, onLogin, onDeposit, rate }: {
  deal: DealDetail; unavailable: boolean; expired: boolean;
  viewer: "loading" | "signed-out" | "owner" | "wallet-pending" | "tenant";
  onLogin: () => void; onDeposit: () => void; rate: number;
}) {
  if (deal.onchain.state !== "OPEN") return <p className="py-2 text-sm font-semibold">Phòng này không còn nhận cọc.</p>;
  if (expired) return <p className="py-2 text-sm font-semibold">Đã hết hạn gửi cọc.</p>;
  if (viewer === "loading") return <p role="status" className="py-2 text-sm">Đang chuẩn bị đăng nhập…</p>;
  if (viewer === "signed-out") return <Button size="lg" className="w-full" onClick={onLogin}>Đăng nhập để gửi cọc</Button>;
  if (viewer === "owner") return <p className="py-2 text-sm font-semibold">Đây là phòng của bạn. Chủ trọ không thể tự gửi cọc.</p>;
  return <>
    {unavailable && <p className="text-sm">Cần cập nhật thông tin và hạn trước khi gửi cọc.</p>}
    {viewer === "wallet-pending" && <p role="status" className="text-sm">Đang chuẩn bị ví…</p>}
    <Button size="lg" className="w-full" disabled={unavailable || viewer === "wallet-pending"} onClick={onDeposit}>Gửi cọc {formatVnd(amountToVnd(deal.onchain.deposit, rate))}</Button>
  </>;
}

function DetailSkeleton() {
  return <div role="status" aria-busy="true" className="space-y-6"><span className="sr-only">Đang tải chi tiết phòng</span><Skeleton className="h-8 w-3/4" /><PageColumns><Skeleton className="aspect-[4/3] rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></PageColumns></div>;
}
