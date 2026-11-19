"use client";
// Màn "Yêu cầu thuê" (/requests).
// Chủ trọ: duyệt → API ghép ngày người thuê chọn vào điều khoản, trả createDealArgs → ví ký createDeal
//          → POST /listings/:id/onchain (giống luồng đăng phòng cũ). Hoặc từ chối.
// Người thuê: xem trạng thái; được duyệt và đã có hợp đồng thì sang /rooms/:dealId để gửi cọc. Hoặc hủy yêu cầu.
import { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Inbox, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { TxStatus } from "@/components/tx-status";
import { ApiClientError } from "@/lib/client/api";
import { formatDate, monthsBetween } from "@/lib/client/date";
import { confirmOnchain } from "@/lib/client/listings-api";
import { shortAddress } from "@/lib/client/money";
import { fetchDeal } from "@/lib/client/rooms-data";
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

  return <>
    <NetworkBanner />
    <PageShell size="read">
      <PageHeader href="/home" backLabel="Về trang chủ" title="Yêu cầu thuê" />
      <div className="mt-4 space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-primary">Yêu cầu thuê</h1>
        <p className="text-muted-foreground">Người thuê chọn ngày và gửi yêu cầu. Chủ trọ duyệt thì ngày đó được khóa vào hợp đồng trên chuỗi, người thuê mới gửi cọc.</p>
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
        {list.map((r) => <RequestCard key={r.requestId} r={r} side={active} getToken={getAccessToken} />)}
      </div>
    </PageShell>
  </>;
}

function RequestCard({ r, side, getToken }: { r: RentalRequest; side: "incoming" | "outgoing"; getToken: () => Promise<string | null> }) {
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
    {side === "incoming" && r.status === "APPROVED" && (r.dealId
      ? <DealProgress dealId={r.dealId} side="incoming" />
      : signed
        ? <Button onClick={retryBind} disabled={!!busy}>{busy === "approve" && <Loader2 className="animate-spin" aria-hidden="true" />}Gắn lại hợp đồng #{signed.dealId}</Button>
        : <div className="space-y-2"><p className="text-sm text-muted-foreground">Đã duyệt nhưng chưa ký hợp đồng lên chuỗi.</p>
          <Button onClick={approve} disabled={!!busy}>{busy === "approve" && <Loader2 className="animate-spin" aria-hidden="true" />}Ký hợp đồng</Button></div>)}

    {side === "outgoing" && r.status === "PENDING" && <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">Chưa mất tiền. Chờ chủ trọ duyệt.</p>
      <Button variant="outline" size="sm" onClick={() => decide("cancel")} disabled={!!busy}>{busy === "cancel" ? "Đang hủy…" : "Hủy yêu cầu"}</Button>
    </div>}
    {side === "outgoing" && r.status === "APPROVED" && (r.dealId
      ? <DealProgress dealId={r.dealId} side="outgoing" />
      : <p className="text-sm text-muted-foreground">Chủ trọ đã duyệt, đang ký hợp đồng lên chuỗi. Trang tự cập nhật.</p>)}
    {side === "outgoing" && r.status === "REJECTED" && <p className="text-sm text-muted-foreground">Bạn có thể chọn ngày khác hoặc <Link href="/rooms" className="text-primary underline">tìm phòng khác</Link>.</p>}
  </article>;
}

/**
 * Hợp đồng đã tạo từ yêu cầu: đọc trạng thái thật trên chuỗi (GET /deals/:id), không đoán.
 * Chưa cọc: người thuê đi gửi cọc. Đã cọc trở đi: cả hai bên mở trang hợp đồng (ảnh nhận/trả phòng, đề xuất, biên nhận).
 */
function DealProgress({ dealId, side }: { dealId: number; side: "incoming" | "outgoing" }) {
  const q = useQuery({ queryKey: ["deal", dealId], queryFn: () => fetchDeal(dealId), refetchInterval: 15_000 });
  const state = q.data?.onchain.state;
  if (!state) return <p className="text-sm text-muted-foreground">Đã tạo hợp đồng #{dealId}. Đang đọc trạng thái…</p>;

  if (state === "OPEN") {
    return side === "outgoing"
      ? <Button asChild size="lg" className="w-full"><Link href={`/rooms/${dealId}`}>Xem hợp đồng và gửi cọc</Link></Button>
      : <p className="text-sm">Đã tạo hợp đồng <Link href={`/deals/${dealId}`} className="font-semibold text-primary underline">#{dealId}</Link>. Chờ người thuê gửi cọc.</p>;
  }
  const STEP: Partial<Record<typeof state, string>> = {
    RESERVED: "Người thuê đã gửi cọc, đang chờ ảnh nhận phòng.",
    ACTIVE: "Người thuê đang ở.",
    CHECKED_OUT: "Người thuê đã trả phòng và gửi ảnh. Chủ trọ đề xuất mức trừ trong hợp đồng.",
    PROPOSED: "Chủ trọ đã đề xuất mức trừ, chờ người thuê trả lời.",
    DISPUTED: "Đang kháng nghị, chờ bồi thẩm.",
    SETTLED: "Đã kết thúc và chia tiền.",
    REFUNDED: "Đã hoàn cọc cho người thuê.",
    CANCELLED: "Hợp đồng đã hủy.",
    MISMATCH_REPORTED: "Người thuê báo phòng sai mô tả.",
    ABANDON_REPORTED: "Chủ trọ báo người thuê bỏ ngang.",
  };
  const text = `Hợp đồng #${dealId}: ${STEP[state] ?? "đang chạy."}`;
  return <div className="space-y-2">
    <p className="text-sm">{text}</p>
    <Button asChild size="lg" variant="secondary" className="w-full"><Link href={`/deals/${dealId}`}>Mở hợp đồng (ảnh nhận và trả phòng)</Link></Button>
  </div>;
}
