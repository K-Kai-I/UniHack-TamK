"use client";
// Màn "Kết quả AI + Đề xuất mức trừ" (chủ trọ) và "Phản hồi / Kháng nghị" (người thuê): docs/user-flow.md GĐ6.
// Cả hai bên cùng thấy MỘT báo cáo (GET /deals/:id/ai/damage công khai): từng vị trí có ảnh nhận phòng và ảnh trả
// phòng đặt cạnh nhau, kết luận của AI, hạng mục bảng giá và số tiền (API nhân đơn giá, AI không tính tiền).
// Phần hành động ở cuối màn đổi theo vai và trạng thái contract:
//   chủ trọ + CHECKED_OUT → đề xuất mức trừ (proposeDeduction), điền sẵn bằng aiAmount;
//   người thuê + PROPOSED → đồng ý (acceptProposal) hoặc kháng nghị (disputeProposal).
import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock,
  Hourglass,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Blocked, InfoBox, Row, Rows } from "@/components/deal-bits";
import { ProposePanel, RespondPanel } from "@/components/deal-response";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { EvidencePhoto } from "@/components/evidence-photo";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { PokeButton } from "@/components/poke-button";
import { PageColumns, PageShell } from "@/components/page-shell";
import { RoomCover } from "@/components/room-cover";
import { fetchDamageAi, startDamageAi, type DamageAiResponse } from "@/lib/client/ai-report-api";
import { ApiClientError } from "@/lib/client/api";
import { deadlineInfo, roleOf, type Role } from "@/lib/client/deal-actions";
import { DEALS_MOCK, fetchDealView, NotFoundError, type DealView } from "@/lib/client/deals-data";
import { amountToVnd, formatToken, formatVnd } from "@/lib/client/money";
import { formatDuration, useCountdown } from "@/lib/client/use-countdown";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import type { Amount, DamagePosition, DamageReport, DamageVerdict, Position } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Trạng thái có thể có báo cáo AI hư hỏng (sau khi trả phòng). */
const AFTER_CHECKOUT = ["CHECKED_OUT", "PROPOSED", "DISPUTED", "SETTLED"];

export function DamageReportScreen({ dealId, previewAs }: { dealId: string; previewAs?: Role }) {
  const id = /^\d+$/.test(dealId) ? Number(dealId) : null;
  const { address } = useAccount();
  const qc = useQueryClient();
  const back = id !== null ? `/deals/${id}${previewAs ? `?as=${previewAs}` : ""}` : "/";

  const deal = useQuery({
    queryKey: ["deal-view", id],
    queryFn: () => fetchDealView(id!),
    enabled: id !== null,
    retry: (n, e) => !(e instanceof NotFoundError) && n < 2,
  });
  const hasCheckout = !!deal.data?.photoSets.checkout;
  const ai = useQuery({
    queryKey: ["damage-ai", id],
    queryFn: async () => {
      const r = await fetchDamageAi(id!);
      // AI vừa xong: tải lại deal để màn Chi tiết hợp đồng cũng thấy báo cáo.
      if (r.status === "done" && !deal.data?.reports.damage) qc.invalidateQueries({ queryKey: ["deal-view", id] });
      return r;
    },
    enabled: id !== null && hasCheckout,
    // AI chạy nền trên server (thường dưới 1 phút): hỏi lại mỗi 3 giây tới khi xong hoặc lỗi.
    refetchInterval: (q) => (q.state.data?.status === "processing" ? 3000 : false),
  });

  // Quá hạn thì contract từ chối đề xuất/trả lời: thay form bằng nút xử lý quá hạn, khỏi ký giao dịch chắc chắn lỗi.
  const { passed: overdue } = useCountdown(deal.data?.onchain.deadline ?? null);

  if (id === null || deal.error instanceof NotFoundError) {
    return <Blocked back="/" header="Báo cáo AI" title="Không tìm thấy hợp đồng này" text="Đường dẫn có thể bị sai." />;
  }
  if (deal.error && !deal.isPending) {
    return (
      <Blocked back={back} header="Báo cáo AI" title="Không tải được hợp đồng" text="Kiểm tra mạng rồi thử lại.">
        <Button onClick={() => deal.refetch()}>Thử lại</Button>
      </Blocked>
    );
  }
  if (!deal.data) return <ScreenSkeleton back={back} />;

  const d = deal.data;
  if (!hasCheckout || !AFTER_CHECKOUT.includes(d.onchain.state)) {
    return (
      <Blocked
        back={back}
        header="Báo cáo AI"
        title="Chưa có báo cáo AI"
        text="AI so ảnh sau khi người thuê gửi ảnh trả phòng."
      />
    );
  }

  const role: Role = DEALS_MOCK && previewAs ? previewAs : roleOf(d, address);
  const proposing = role === "landlord" && d.onchain.state === "CHECKED_OUT";
  const responding = role === "tenant" && d.onchain.state === "PROPOSED";

  return (
    <>
      <NetworkBanner />
      <ReportLayout
        deal={d}
        role={role}
        back={back}
        ai={ai.data}
        aiLoading={ai.isPending}
        aiLoadFailed={ai.isError && !ai.data}
        onRetryAi={() => ai.refetch()}
        onExpire={() => deal.refetch()}
        action={
          (proposing || responding) && overdue ? (
            <OverduePanel deal={d} role={role} />
          ) : proposing ? (
            // Không cần key: ProposeView tự điền theo aiAmount khi AI xong và giữ chữ chủ trọ đã gõ.
            <ProposePanel
              deal={d}
              ai={ai.data}
              aiLoading={ai.isPending}
              back={back}
            />
          ) : responding ? (
            <RespondPanel deal={d} back={back} />
          ) : null
        }
      />
    </>
  );
}

// ------------------------------------------------------------------ bố cục

const INTRO: Record<"propose" | "respond" | "view", string> = {
  propose: "Xem AI so ảnh từng vị trí, rồi nhập mức trừ bạn đề xuất. Người thuê sẽ đồng ý hoặc kháng nghị.",
  respond: "Chủ trọ đã đề xuất mức trừ. Xem ảnh và kết quả AI, rồi đồng ý hoặc kháng nghị trước hạn.",
  view: "Cả hai bên thấy cùng một báo cáo: ảnh nhận phòng, ảnh trả phòng và kết luận của AI cho từng vị trí.",
};

/**
 * Thân màn báo cáo, tách khỏi việc tải dữ liệu để trang xem thử dùng được với dữ liệu giả.
 * Một cây DOM: mobile xếp hạn + kết luận → ảnh từng vị trí → hành động; từ 1024px kết luận và hành động ở cột phải.
 */
export function ReportLayout({
  deal,
  role,
  back,
  ai,
  aiLoading,
  aiLoadFailed,
  onRetryAi,
  onExpire,
  action,
}: {
  deal: DealView;
  role: Role;
  back: string;
  ai: DamageAiResponse | undefined;
  aiLoading: boolean;
  aiLoadFailed: boolean;
  onRetryAi: () => void;
  onExpire: () => void;
  /** ProposePanel / RespondPanel (task 13) hoặc null khi chỉ xem. */
  action: React.ReactNode;
}) {
  const proposing = role === "landlord" && deal.onchain.state === "CHECKED_OUT";
  const responding = role === "tenant" && deal.onchain.state === "PROPOSED";
  const title = proposing ? "Đề xuất mức trừ" : responding ? "Trả lời đề xuất" : "Báo cáo AI";
  const intro = INTRO[proposing ? "propose" : responding ? "respond" : "view"];

  return (
    <PageShell>
      <PageHeader href={back} backLabel="Về hợp đồng" title={title} />
      <header className="mt-2 mb-6 space-y-3 [overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <DealStatusBadge state={deal.onchain.state} />
          <span className="text-sm text-muted-foreground">Hợp đồng #{deal.dealId}</span>
        </div>
        <h1 className="max-w-[36ch] text-2xl leading-snug font-extrabold tracking-tight text-balance text-primary sm:text-3xl">
          {deal.terms.room.title}
        </h1>
        <p className="max-w-[65ch] text-muted-foreground">{intro}</p>
      </header>

      <PageColumns className="lg:grid-rows-[auto_1fr] lg:gap-y-4">
        <div className="min-w-0 space-y-6 lg:col-start-2 lg:row-start-1">
          <DeadlineLine deal={deal} onExpire={onExpire} />
          <Verdict
            deal={deal}
            role={role}
            ai={ai}
            loading={aiLoading}
            loadFailed={aiLoadFailed}
            onRetry={onRetryAi}
          />
        </div>

        <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <PositionList deal={deal} report={ai?.report ?? deal.reports.damage} />
          <Explanation deal={deal} ai={ai} />
        </div>

        {action && <div className="min-w-0 lg:col-start-2 lg:row-start-2">{action}</div>}
      </PageColumns>
    </PageShell>
  );
}

// ------------------------------------------------------------------ hạn chót

function OverduePanel({ deal, role }: { deal: DealView; role: Role }) {
  const info = deadlineInfo(deal.onchain.state, true);
  return (
    <section aria-labelledby="overdue-title" className="space-y-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-5">
      <h2 id="overdue-title" className="text-lg font-bold">Đã quá hạn {role === "landlord" ? "đề xuất" : "trả lời"}</h2>
      <p className="text-sm text-foreground/80">
        Contract không nhận {role === "landlord" ? "đề xuất" : "câu trả lời"} sau hạn chót nữa.
        {info ? ` Theo luật đã chốt: ${info.onTimeout}` : ""}
      </p>
      <p className="text-sm text-muted-foreground">Bấm nút dưới để chốt, hoặc chờ bot của app tự xử lý trong vài phút.</p>
      <PokeButton deal={deal} receiptHref={`/deals/${deal.dealId}/receipt`} />
    </section>
  );
}

function DeadlineLine({ deal, onExpire }: { deal: DealView; onExpire: () => void }) {
  const info = deadlineInfo(deal.onchain.state, true);
  const { passed, msLeft } = useCountdown(deal.onchain.deadline, onExpire);
  if (!info || msLeft === null) return null;
  return (
    <div
      className={cn(
        "space-y-2 rounded-2xl px-5 py-4 ring-1",
        passed ? "bg-destructive/5 ring-destructive/20" : "bg-warning/10 ring-warning/30",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Hourglass className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {info.waiting}
        </p>
        <p className={cn("shrink-0 text-lg font-extrabold tabular-nums", passed ? "text-destructive" : "text-primary")}>
          {passed ? "Quá hạn" : formatDuration(msLeft)}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">Nếu hết hạn: {info.onTimeout}</p>
    </div>
  );
}

// ------------------------------------------------------------------ kết luận của AI (cột tóm tắt)

function Verdict({
  deal,
  role,
  ai,
  loading,
  loadFailed,
  onRetry,
}: {
  deal: DealView;
  role: Role;
  ai: DamageAiResponse | undefined;
  loading: boolean;
  loadFailed: boolean;
  onRetry: () => void;
}) {
  const report = ai?.report ?? deal.reports.damage;
  const status = ai?.status ?? deal.aiStatus.damage ?? "none";

  return (
    <section aria-labelledby="ai-report" className="space-y-3" aria-busy={loading && !report}>
      <h2 id="ai-report" className="flex items-center gap-2 text-lg font-bold">
        <Sparkles className="size-5 text-primary" aria-hidden="true" /> Kết luận của AI
      </h2>
      {report ? (
        // sealed = null: chưa biết (không tải được kết quả AI, chưa đề xuất nên contract chưa ghi con dấu).
        <ReportSummary deal={deal} report={report} sealed={ai ? !!ai.seal : deal.onchain.hasAiSeal ? true : null} />
      ) : loading ? (
        <Skeleton className="h-32 w-full rounded-2xl" />
      ) : (
        <AiStatusBox
          deal={deal}
          role={role}
          status={status}
          error={ai?.error}
          loadFailed={loadFailed}
          onRetry={onRetry}
        />
      )}
    </section>
  );
}

/** Chưa có báo cáo: tải lỗi, AI đang chạy, bị lỗi, hoặc chưa ai bấm chạy. */
function AiStatusBox({
  deal,
  role,
  status,
  error,
  loadFailed,
  onRetry,
}: {
  deal: DealView;
  role: Role;
  status: DamageAiResponse["status"];
  error?: string;
  loadFailed: boolean;
  onRetry: () => void;
}) {
  const { getAccessToken } = usePrivy();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const party = role === "tenant" || role === "landlord";
  const canStart = party && deal.onchain.state === "CHECKED_OUT";

  async function start() {
    setStarting(true);
    setStartError("");
    try {
      await startDamageAi(deal.dealId, await getAccessToken());
      onRetry();
    } catch (e) {
      setStartError(e instanceof ApiClientError ? e.message : "Chưa gọi được AI. Thử lại sau một lát.");
    } finally {
      setStarting(false);
    }
  }

  // Chưa có việc AI nào (lệnh gọi lúc trả phòng bị mất): tự chạy một lần khi mở màn, không bắt người dùng bấm.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (status !== "none" || !canStart || loadFailed || autoStarted.current) return;
    autoStarted.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, canStart, loadFailed]);

  const noSealNote =
    role === "landlord" && deal.onchain.state === "CHECKED_OUT"
      ? "Bạn vẫn đề xuất được, nhưng đề xuất sẽ không có con dấu AI."
      : "";

  if (loadFailed) {
    return (
      <InfoBox icon={<AlertTriangle className="size-5" />} tone="warning" title="Chưa tải được kết quả AI">
        <p>Kiểm tra mạng rồi tải lại. {noSealNote}</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
          <RefreshCw /> Tải lại
        </Button>
      </InfoBox>
    );
  }

  if (status === "processing") {
    return (
      <div role="status">
        <InfoBox icon={<Loader2 className="size-5 animate-spin motion-reduce:animate-none" />} title="AI đang so ảnh…">
          Thường mất dưới 1 phút. Màn này tự cập nhật.
        </InfoBox>
      </div>
    );
  }

  return (
    <InfoBox
      icon={<AlertTriangle className="size-5" />}
      tone="warning"
      title={status === "failed" ? "AI chưa so được ảnh" : starting ? "Đang nhờ AI so ảnh…" : "Chưa chạy AI so ảnh"}
    >
      <p>
        {status === "failed" ? (error ? `${error} ` : "Máy chủ AI gặp lỗi. ") : starting ? "" : "Chưa gọi được AI. "}
        {noSealNote}
      </p>
      {canStart && (
        <Button size="sm" variant="outline" className="mt-2" disabled={starting} onClick={start}>
          {starting ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {status === "failed" ? "Chạy lại AI" : "Chạy AI so ảnh"}
        </Button>
      )}
      {startError && (
        <p role="alert" className="mt-1 font-medium text-destructive">
          {startError}
        </p>
      )}
    </InfoBox>
  );
}

function ReportSummary({ deal, report, sealed }: { deal: DealView; report: DamageReport; sealed: boolean | null }) {
  const rate = useVndRate();
  const vnd = (a: Amount) => formatVnd(amountToVnd(a, rate));
  const count = (v: DamageVerdict) => report.positions.filter((p) => p.verdict === v).length;
  const outside = report.positions.filter((p) => p.outsidePriceList).length;
  const capped = BigInt(report.totalAmount) > BigInt(report.sealedAmount);

  const parts = (["NEW_DAMAGE", "WEAR", "NO_CHANGE", "UNCLEAR"] as const).filter((v) => count(v) > 0);

  return (
    <div className="space-y-3">
      <Rows>
        <Row label="AI tính mức trừ" value={vnd(report.sealedAmount)} sub={formatToken(report.sealedAmount)} strong />
        {capped && <Row label="Tổng hư hỏng" value={vnd(report.totalAmount)} sub="vượt tiền cọc, chỉ tính bằng cọc" />}
        <Row label="Tiền cọc" value={vnd(deal.onchain.deposit)} />
      </Rows>

      <ul aria-label="Số vị trí theo kết luận" className="flex flex-wrap gap-2">
        {parts.map((v) => (
          <li key={v}>
            <VerdictBadge verdict={v} suffix={`× ${count(v)}`} />
          </li>
        ))}
      </ul>

      {sealed ? (
        <InfoBox icon={<ShieldCheck className="size-5" />} tone="success" title="Có con dấu AI">
          Con số trên được máy chủ AI ký. Contract tự kiểm tra chữ ký, không ai sửa được.
          <span className="mt-1 block text-xs text-muted-foreground">
            {report.model} · {report.promptVersion}
          </span>
        </InfoBox>
      ) : sealed === false ? (
        <InfoBox icon={<AlertTriangle className="size-5" />} tone="warning" title="Chưa có con dấu AI">
          Báo cáo này chưa được ký nên số tiền chỉ để tham khảo, contract không dùng nó để kiểm tra.
        </InfoBox>
      ) : null}
      {outside > 0 && (
        <InfoBox icon={<AlertTriangle className="size-5" />} tone="warning" title={`${outside} hư hỏng ngoài bảng giá`}>
          AI chỉ gắn nhãn, không cộng vào con số đã ký. Chủ trọ có thể tự cộng vào đề xuất; người thuê có quyền kháng
          nghị.
        </InfoBox>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ từng vị trí

export const VERDICT: Record<DamageVerdict, { label: string; cls: string; Icon: LucideIcon }> = {
  NEW_DAMAGE: { label: "Hư hỏng mới", cls: "bg-destructive/10 text-destructive", Icon: CircleAlert },
  WEAR: { label: "Hao mòn tự nhiên", cls: "bg-secondary text-primary", Icon: Clock },
  NO_CHANGE: { label: "Không đổi", cls: "bg-success/10 text-success", Icon: CircleCheck },
  UNCLEAR: { label: "Ảnh chưa đủ rõ để kết luận", cls: "bg-warning/15 text-foreground", Icon: CircleHelp },
};

/** Nhãn kết luận: luôn có chữ và biểu tượng, không chỉ dựa vào màu. */
function VerdictBadge({ verdict, suffix }: { verdict: DamageVerdict; suffix?: string }) {
  const { label, cls, Icon } = VERDICT[verdict];
  return (
    <span className={cn("inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", cls)}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
      {suffix && <span className="tabular-nums">{suffix}</span>}
    </span>
  );
}

function PositionList({ deal, report }: { deal: DealView; report: DamageReport | null }) {
  return (
    <section aria-labelledby="ai-positions" className="space-y-4">
      <div className="space-y-1">
        <h2 id="ai-positions" className="text-lg font-bold">
          So ảnh từng vị trí
        </h2>
        <p className="max-w-[65ch] text-sm text-muted-foreground">
          Mỗi vị trí chụp ở cùng góc khi nhận và trả phòng. Ảnh hiện đủ khung, không cắt; mở ảnh gốc để xem rõ chi tiết.
        </p>
      </div>
      <ul className="space-y-5">
        {deal.terms.positions.map((p, i) => (
          <PositionCard
            key={p.id}
            deal={deal}
            position={p}
            index={i + 1}
            result={report?.positions.find((r) => r.positionId === p.id) ?? null}
            hasReport={!!report}
          />
        ))}
      </ul>
    </section>
  );
}

function PositionCard({
  deal,
  position,
  index,
  result,
  hasReport,
}: {
  deal: DealView;
  position: Position;
  index: number;
  result: DamagePosition | null;
  /** Báo cáo đã có nhưng không có dòng cho vị trí này → nói rõ thay vì để trống. */
  hasReport: boolean;
}) {
  const { checkin, checkout } = deal.photoSets;
  const itemOf = (set: typeof checkin) => set?.items.find((it) => it.positionId === position.id);
  const before = itemOf(checkin);
  const after = itemOf(checkout);

  return (
    <li
      className={cn(
        "space-y-4 rounded-2xl border bg-card p-4 [overflow-wrap:anywhere]",
        result && BigInt(result.amount) > 0n && "border-destructive/30",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <h3 className="min-w-0 font-semibold">
          <span className="mr-2 text-sm font-normal text-muted-foreground tabular-nums">{index}.</span>
          {position.name}
        </h3>
        {result && <VerdictBadge verdict={result.verdict} />}
      </div>

      <div className="grid gap-4 min-[30rem]:grid-cols-2">
        <EvidencePhoto
          label="Lúc nhận phòng"
          url={before?.url}
          alt={`Ảnh nhận phòng: ${position.name}`}
          empty={checkin ? (before ? null : "Không có ảnh vị trí này") : "Không có ảnh nhận phòng"}
        />
        <EvidencePhoto
          label="Lúc trả phòng"
          url={after?.url}
          alt={`Ảnh trả phòng: ${position.name}`}
          empty={after ? null : "Không có ảnh vị trí này"}
        />
      </div>

      {result ? (
        <PositionResult deal={deal} result={result} />
      ) : (
        hasReport && <p className="text-sm text-muted-foreground">AI chưa đánh giá vị trí này nên không tính tiền.</p>
      )}
    </li>
  );
}

/** Nhận xét + hệ quả về tiền của một vị trí. Số tiền do API nhân đơn giá; AI chỉ chọn hạng mục và số lượng. */
function PositionResult({ deal, result }: { deal: DealView; result: DamagePosition }) {
  const rate = useVndRate();
  const price = result.priceItemId ? deal.terms.priceList.find((i) => i.id === result.priceItemId) : undefined;
  const charged = BigInt(result.amount) > 0n;

  return (
    <div className="space-y-3 border-t pt-3 text-sm">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">AI nhận xét</p>
        <p className="max-w-[65ch] text-foreground/90">{result.description}</p>
        <p className="text-xs text-muted-foreground">Độ chắc chắn của AI: {Math.round(result.confidence * 100)}%</p>
      </div>

      {charged ? (
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg bg-destructive/5 px-3 py-2">
          <span>
            {price ? (
              <>
                Trừ: {price.item} × {result.quantity} {price.unit}
              </>
            ) : (
              "Mức trừ vị trí này"
            )}
          </span>
          <span className="font-bold text-destructive tabular-nums">{formatVnd(amountToVnd(result.amount, rate))}</span>
        </p>
      ) : (
        <p className="rounded-lg bg-muted px-3 py-2 text-muted-foreground">{noChargeReason(result)}</p>
      )}

      {result.outsidePriceList && (
        <p className="rounded-lg bg-warning/10 px-3 py-2">
          Hư hỏng này không có trong bảng giá: không cộng vào số tiền AI đã ký. Chủ trọ có thể tự cộng vào đề xuất.
        </p>
      )}
    </div>
  );
}

function noChargeReason(r: DamagePosition): string {
  switch (r.verdict) {
    case "WEAR":
      return "Không trừ: hao mòn bình thường theo thời gian.";
    case "NO_CHANGE":
      return "Không trừ: không thấy khác biệt giữa hai ảnh.";
    case "UNCLEAR":
      return "Ảnh chưa đủ rõ để kết luận (có thể mờ, tối hoặc sai góc). AI chưa tính tiền vị trí này; không có nghĩa là không có hư hỏng.";
    default:
      return r.outsidePriceList ? "Chưa tính tiền vị trí này." : "Không trừ ở vị trí này.";
  }
}

// ------------------------------------------------------------------ lời giải thích ngoài con dấu

function Explanation({ deal, ai }: { deal: DealView; ai: DamageAiResponse | undefined }) {
  const report = ai?.report ?? deal.reports.damage;
  const explanation = ai?.explanation ?? deal.explanation;
  if (!report || !explanation) return null;
  return (
    <section
      aria-labelledby="ai-explanation"
      className="max-w-[65ch] space-y-2 rounded-2xl border border-dashed p-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="ai-explanation" className="font-semibold">
          Lời giải thích thêm của AI
        </h2>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
          Không nằm trong con dấu
        </span>
      </div>
      <p className="text-sm text-foreground/80">{explanation}</p>
      <p className="text-xs text-muted-foreground">
        Chỉ để tham khảo. Con số tính tiền chỉ lấy từ báo cáo đã ký ở trên, không lấy từ đoạn này.
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ dùng chung với màn khác

/** Ô ảnh vuông cũ, còn dùng ở bồi thẩm và phòng sai mô tả (task 14, 16 sẽ chuyển sang EvidencePhoto). */
export function PhotoTile({ url, label, alt, large }: { url: string | null; label: string; alt: string; large?: boolean }) {
  return (
    <figure className="space-y-1">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10",
          large ? "aspect-[4/3]" : "aspect-square",
        )}
      >
        <RoomCover url={url} alt={alt} label={url ? undefined : "Chưa có ảnh"} className={large ? "object-contain" : undefined} />
        <figcaption className="absolute top-1.5 left-1.5 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-semibold text-foreground">
          {label}
        </figcaption>
      </div>
    </figure>
  );
}

function ScreenSkeleton({ back }: { back: string }) {
  return (
    <PageShell aria-busy="true">
      <PageHeader href={back} backLabel="Về hợp đồng" title="Báo cáo AI" />
      <p role="status" className="sr-only">
        Đang tải báo cáo AI…
      </p>
      <div className="mt-2 mb-6 space-y-3">
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-9 w-4/5" />
      </div>
      <PageColumns>
        <div className="space-y-6 lg:col-start-2">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
        <div className="space-y-5 lg:col-start-1 lg:row-start-1">
          <Skeleton className="h-6 w-48" />
          <div className="grid gap-4 min-[30rem]:grid-cols-2">
            <Skeleton className="aspect-[4/3] rounded-xl" />
            <Skeleton className="aspect-[4/3] rounded-xl" />
          </div>
        </div>
      </PageColumns>
    </PageShell>
  );
}
