"use client";
// Màn "Yêu cầu thuê" (/requests).
// Chủ trọ: duyệt → API ghép ngày người thuê chọn vào điều khoản, trả createDealArgs → ví ký createDeal
//          → POST /listings/:id/onchain (giống luồng đăng phòng cũ). Hoặc từ chối.
// Người thuê: xem trạng thái; được duyệt và đã có hợp đồng thì sang /rooms/:dealId để gửi cọc. Hoặc hủy yêu cầu.
import { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, Inbox, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { TxStatus } from "@/components/tx-status";
import { ApiClientError } from "@/lib/client/api";
import { formatDate, monthsBetween } from "@/lib/client/date";
import { confirmOnchain } from "@/lib/client/listings-api";
import { shortAddress } from "@/lib/client/money";
import { actionsFor, type Role } from "@/lib/client/deal-actions";
import { fetchDealView, type DealView } from "@/lib/client/deals-data";
import { approveRequest, decideRequest, fetchRequests, type RentalRequest, type RequestStatus } from "@/lib/client/rooms-api";
import { isUnresolved, signOrResume, useCreateDeal } from "@/lib/client/use-create-deal";
import { useSignAs } from "@/lib/client/use-sign-as";
import type { Hash } from "@/lib/types";

const STATUS: Record<RequestStatus, { label: string; tone: string }> = {
  PENDING: { label: "Chờ chủ trọ duyệt", tone: "bg-warning/15 text-warning-foreground" },
  APPROVED: { label: "Đã duyệt", tone: "bg-success/15 text-success" },
  REJECTED: { label: "Chủ trọ từ chối", tone: "bg-destructive/10 text-destructive" },
  CANCELLED: { label: "Đã hủy", tone: "bg-muted text-muted-foreground" },
};

export function RentalRequests() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const [tab, setTab] = useState<"incoming" | "outgoing" | null>(null);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["requests"],
    queryFn: async () => fetchRequests(await getAccessToken()),
    enabled: ready && authenticated,
    refetchInterval: 15_000,
  });

  if (ready && !authenticated) return <PageShell size="read">
    <PageHeader href="/home" backLabel="Về trang chủ" title="Yêu cầu thuê" />
    <section className="my-8 max-w-xl space-y-4 rounded-2xl bg-secondary p-6">
      <h1 className="text-2xl font-bold text-primary">Đăng nhập để xem yêu cầu thuê</h1>
      <Button size="lg" onClick={login}>Đăng nhập</Button>
    </section>
  </PageShell>;

  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];
  // Mặc định mở tab có việc cần làm: chủ trọ có yêu cầu chờ duyệt thì mở "Gửi đến tôi".
  const active = tab ?? (incoming.length > 0 && outgoing.length === 0 ? "incoming" : incoming.some((r) => r.status === "PENDING") ? "incoming" : "outgoing");
  const list = active === "incoming" ? incoming : outgoing;

  const isOld = (r: RentalRequest) => r.status === "CANCELLED" || r.status === "REJECTED";
  const current = list.filter((r) => !isOld(r));
  const old = list.filter(isOld);

  return <>
    <NetworkBanner />
    <PageShell size="read">
      {/* Một tiêu đề (không lặp ở thanh trên), một câu ngắn. */}
      <PageHeader href="/home" backLabel="Về trang chủ" />
      <div className="mt-4 space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-primary">Yêu cầu thuê</h1>
        <p className="text-muted-foreground">Chủ trọ duyệt xong, người thuê mới gửi cọc.</p>
      </div>
      <div role="tablist" aria-label="Loại yêu cầu" className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
        {([["outgoing", "Tôi đã gửi", outgoing.length, Send], ["incoming", "Gửi đến phòng của tôi", incoming.filter((r) => r.status === "PENDING").length, Inbox]] as const).map(([id, label, n, Icon]) =>
          <button key={id} role="tab" aria-selected={active === id} onClick={() => setTab(id)}
            className={"flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium " + (active === id ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}>
            <Icon className="size-4" aria-hidden="true" />{label}{n > 0 && <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{n}</span>}
          </button>)}
      </div>

      <div className="mt-6 space-y-4" role="tabpanel">
        {(!ready || (isPending && authenticated)) && <p role="status" className="text-sm text-muted-foreground">Đang tải…</p>}
        {isError && <div role="alert" className="space-y-2 rounded-xl bg-muted p-4 text-sm"><p>Không tải được yêu cầu.</p><Button size="sm" variant="secondary" onClick={() => void refetch()}>Thử lại</Button></div>}
        {data && list.length === 0 && <div className="rounded-2xl bg-muted p-6 text-center text-sm text-muted-foreground">
          {active === "outgoing" ? <>Bạn chưa gửi yêu cầu nào. <Link href="/rooms" className="text-primary underline">Tìm phòng</Link></>
            : <>Chưa có yêu cầu nào gửi đến phòng của bạn. <Link href="/listings/new" className="text-primary underline">Đăng phòng</Link></>}
        </div>}
        {current.map((r) => <RequestCard key={r.requestId} r={r} side={active} getToken={getAccessToken} />)}
        {/* Yêu cầu đã hủy / bị từ chối không còn việc gì: gom xuống cuối, gập lại. */}
        {old.length > 0 && <details className="group rounded-2xl border [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-muted-foreground select-none">
            Yêu cầu cũ ({old.length})
            <ChevronRight className="size-4 shrink-0 transition group-open:rotate-90" aria-hidden="true" />
          </summary>
          <div className="space-y-4 border-t p-4">
            {old.map((r) => <RequestCard key={r.requestId} r={r} side={active} getToken={getAccessToken} />)}
          </div>
        </details>}
      </div>
    </PageShell>
  </>;
}

function RequestCard(props: { r: RentalRequest; side: "incoming" | "outgoing"; getToken: () => Promise<string | null> }) {
  return props.r.status === "APPROVED" && props.r.dealId ? <DealCard r={props.r} side={props.side} /> : <PendingCard {...props} />;
}

function PendingCard({ r, side, getToken }: { r: RentalRequest; side: "incoming" | "outgoing"; getToken: () => Promise<string | null> }) {
  const qc = useQueryClient();
  const deal = useCreateDeal();
  const signAs = useSignAs();
  const [busy, setBusy] = useState<null | "approve" | "reject" | "cancel">(null);
  const [error, setError] = useState<string | null>(null);
  // Hợp đồng vừa lên chuỗi nhưng chưa gắn được vào yêu cầu. Còn giá trị này thì KHÔNG cho ký lại (ký lại = tạo deal thứ hai),
  // chỉ cho gắn lại.
  const [signed, setSigned] = useState<{ listingId: string; dealId: number; txHash: Hash } | null>(null);
  const s = STATUS[r.status];
  const refresh = () => qc.invalidateQueries({ queryKey: ["requests"] });

  async function decide(action: "reject" | "cancel") {
    setBusy(action); setError(null);
    try { await decideRequest(r.requestId, action, await getToken()); await refresh(); }
    catch (e) { setError(e instanceof ApiClientError ? e.message : "Có lỗi, thử lại sau."); }
    finally { setBusy(null); }
  }

  // Duyệt = lấy điều khoản đầy đủ từ API rồi ký createDeal. Gọi lại an toàn: API trả đúng tin đăng cũ nếu chưa lên chuỗi,
  // và signOrResume không ký lần hai khi giao dịch trước đã gửi mà chưa biết kết quả.
  async function approve() {
    setBusy("approve"); setError(null);
    try {
      const token = await getToken();
      const a = await approveRequest(r.requestId, token);
      if (a.dealId === null) {
        // Chặn ký nhầm ví trước khi ký (ký nhầm = hợp đồng lên chuỗi mà không gắn được).
        const wrong = await signAs(r.landlord);
        if (wrong) { setError(wrong); await refresh(); return; }
        const res = await signOrResume(deal.state, deal, a.createDealArgs);
        if (!res.ok) {
          if (isUnresolved(res)) setError("Giao dịch đã gửi nhưng chưa biết kết quả. Đừng ký lại, bấm “Ký hợp đồng” để kiểm tra.");
          return;
        }
        const done = { listingId: a.listingId, dealId: Number(res.dealId), txHash: res.txHash };
        setSigned(done);
        await bind(done, token);
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Có lỗi, thử lại sau.");
    } finally { setBusy(null); }
  }

  // Gắn hợp đồng đã lên chuỗi vào yêu cầu. Lỗi thì báo rõ, giữ nút "Gắn lại" thay cho nút ký.
  async function bind(done: { listingId: string; dealId: number; txHash: Hash }, token?: string | null) {
    setError(null);
    try {
      await confirmOnchain(done.listingId, { dealId: done.dealId, txHash: done.txHash }, token ?? (await getToken()));
      setSigned(null);
      await refresh();
    } catch (e) {
      const why = e instanceof ApiClientError ? e.message : "Không kết nối được máy chủ.";
      setError(`Hợp đồng #${done.dealId} đã lên chuỗi nhưng chưa gắn được vào yêu cầu: ${why} Đừng ký lại, bấm “Gắn lại”.`);
    }
  }

  async function retryBind() {
    if (!signed) return;
    setBusy("approve");
    try { await bind(signed); } finally { setBusy(null); }
  }

  return <article className="space-y-3 rounded-2xl border border-border p-5 [overflow-wrap:anywhere]">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h2 className="font-bold"><Link href={`/rooms/r/${r.roomId}`} className="hover:underline">{r.title || "Phòng"}</Link></h2>
      <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + s.tone}>{s.label}</span>
    </div>
    <p className="flex items-start gap-2 text-sm"><CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      Dọn vào {formatDate(r.moveInDate)} · hết hạn {formatDate(r.leaseEnd)} (khoảng {monthsBetween(r.moveInDate, r.leaseEnd)} tháng)</p>
    {side === "incoming" && <p className="text-sm text-muted-foreground">Người thuê: <span className="font-mono">{shortAddress(r.tenant)}</span></p>}
    {r.note && <p className="rounded-lg bg-muted p-3 text-sm">“{r.note}”</p>}

    {deal.state.phase !== "idle" && <TxStatus state={deal.state} doneText="Đã ký hợp đồng" />}
    {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}

    {side === "incoming" && r.status === "PENDING" && <div className="flex flex-wrap gap-2">
      <Button onClick={approve} disabled={!!busy} className="flex-1">{busy === "approve" && <Loader2 className="animate-spin" aria-hidden="true" />}Duyệt và ký hợp đồng</Button>
      <Button variant="outline" onClick={() => decide("reject")} disabled={!!busy}>Từ chối</Button>
    </div>}
    {side === "incoming" && r.status === "APPROVED" && (signed
        ? <Button onClick={retryBind} disabled={!!busy}>{busy === "approve" && <Loader2 className="animate-spin" aria-hidden="true" />}Gắn lại hợp đồng #{signed.dealId}</Button>
        : <div className="space-y-2"><p className="text-sm text-muted-foreground">Đã duyệt nhưng chưa ký hợp đồng lên chuỗi.</p>
          <Button onClick={approve} disabled={!!busy}>{busy === "approve" && <Loader2 className="animate-spin" aria-hidden="true" />}Ký hợp đồng</Button></div>)}

    {side === "outgoing" && r.status === "PENDING" && <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">Chưa mất tiền. Chờ chủ trọ duyệt.</p>
      <Button variant="outline" size="sm" onClick={() => decide("cancel")} disabled={!!busy}>{busy === "cancel" ? "Đang hủy…" : "Hủy yêu cầu"}</Button>
    </div>}
    {side === "outgoing" && r.status === "APPROVED" && ( <p className="text-sm text-muted-foreground">Chủ trọ đã duyệt, đang ký hợp đồng lên chuỗi. Trang tự cập nhật.</p>)}
    {side === "outgoing" && r.status === "REJECTED" && <p className="text-sm text-muted-foreground">Bạn có thể chọn ngày khác hoặc <Link href="/rooms" className="text-primary underline">tìm phòng khác</Link>.</p>}
  </article>;
}

/**
 * Yêu cầu đã thành hợp đồng: cả thẻ là một nút mở hợp đồng (chưa cọc thì người thuê mở trang gửi cọc).
 * Trạng thái đọc thật từ GET /deals/:id (không đoán). Việc đang chờ chính người xem làm thì hiện một dòng đỏ
 * "Đến lượt bạn: …", lấy từ cùng bảng nút theo trạng thái với trang hợp đồng (deal-actions.ts).
 */
function DealCard({ r, side }: { r: RentalRequest; side: "incoming" | "outgoing" }) {
  const dealId = r.dealId!;
  const q = useQuery({ queryKey: ["deal-view", dealId], queryFn: () => fetchDealView(dealId), refetchInterval: 15_000 });
  const p = q.data ? progressOf(q.data, side) : null;
  const href = p?.href ?? `/deals/${dealId}`;
  const s = STATUS[r.status];
  return <Link href={href} className="block space-y-3 rounded-2xl border border-border p-5 transition-colors [overflow-wrap:anywhere] hover:border-primary hover:bg-secondary/50">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h2 className="font-bold">{r.title || "Phòng"}</h2>
      <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + s.tone}>{s.label}</span>
    </div>
    <p className="flex items-start gap-2 text-sm"><CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      Dọn vào {formatDate(r.moveInDate)} · hết hạn {formatDate(r.leaseEnd)} (khoảng {monthsBetween(r.moveInDate, r.leaseEnd)} tháng)</p>
    {side === "incoming" && <p className="text-sm text-muted-foreground">Người thuê: <span className="font-mono">{shortAddress(r.tenant)}</span></p>}
    <p className="text-sm">{p ? `Hợp đồng #${dealId}: ${p.text}` : `Hợp đồng #${dealId}. Đang đọc trạng thái…`}</p>
    {p?.todo && <p className="text-sm font-semibold text-destructive">Đến lượt bạn: {p.todo}</p>}
  </Link>;
}

const STEP_TEXT: Partial<Record<DealView["onchain"]["state"], string>> = {
  OPEN: "Chờ người thuê gửi cọc.",
  RESERVED: "Người thuê đã gửi cọc, đang chờ ảnh nhận phòng.",
  ACTIVE: "Người thuê đang ở.",
  CHECKED_OUT: "Người thuê đã trả phòng và gửi ảnh.",
  PROPOSED: "Chủ trọ đã đề xuất mức trừ, chờ người thuê trả lời.",
  DISPUTED: "Đang kháng nghị, chờ bồi thẩm.",
  SETTLED: "Đã kết thúc và chia tiền.",
  REFUNDED: "Đã hoàn cọc cho người thuê.",
  CANCELLED: "Hợp đồng đã hủy.",
  MISMATCH_REPORTED: "Người thuê báo phòng không giống mô tả.",
  ABANDON_REPORTED: "Chủ trọ báo người thuê bỏ ngang.",
};

/** Câu trạng thái, việc đang chờ người xem làm (nếu có) và nơi thẻ mở ra. */
export function progressOf(d: DealView, side: "incoming" | "outgoing"): { text: string; todo: string | null; href: string } {
  const state = d.onchain.state;
  const role: Role = side === "incoming" ? "landlord" : "tenant";
  const hasCheckIn = d.photoSets.checkin !== null;
  const passed = d.onchain.deadline !== null && Date.now() > Date.parse(d.onchain.deadline);
  let text = STEP_TEXT[state] ?? "Đang chạy.";
  if (state === "RESERVED" && hasCheckIn) {
    text = passed ? "Người thuê đã gửi ảnh nhận phòng. Hợp đồng đang chuyển sang Đang ở." : "Người thuê đã gửi ảnh nhận phòng, chủ trọ đang xem ảnh.";
  }
  if (state === "OPEN" && role === "tenant") return { text, todo: "gửi cọc", href: `/rooms/${d.dealId}` };
  // Người thuê vừa gửi ảnh nhận phòng: báo chủ trọ xem (phản đối nếu ảnh sai) trước khi hết hạn.
  if (state === "RESERVED" && hasCheckIn && !passed && role === "landlord") {
    return { text, todo: "xem ảnh nhận phòng (phản đối nếu ảnh không đúng)", href: `/deals/${d.dealId}` };
  }
  const first = actionsFor(d, role, Date.now(), null).find((a) => a.variant === "primary");
  return { text, todo: first ? first.label.charAt(0).toLowerCase() + first.label.slice(1) : null, href: `/deals/${d.dealId}` };
}
