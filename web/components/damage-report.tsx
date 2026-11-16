"use client";
// Màn "Kết quả AI + Đề xuất mức trừ" (chủ trọ) và "Phản hồi / Kháng nghị" (người thuê): docs/user-flow.md GĐ6.
// Cả hai bên cùng thấy MỘT báo cáo (GET /deals/:id/ai/damage công khai): từng vị trí có ảnh nhận phòng và ảnh trả
// phòng đặt cạnh nhau, kết luận của AI, hạng mục bảng giá và số tiền (API nhân đơn giá, AI không tính tiền).
// Phần hành động ở cuối màn đổi theo vai và trạng thái contract:
//   chủ trọ + CHECKED_OUT → đề xuất mức trừ (proposeDeduction), điền sẵn bằng aiAmount;
//   người thuê + PROPOSED → đồng ý (acceptProposal) hoặc kháng nghị (disputeProposal).
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Hourglass, Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Blocked, InfoBox, Row, Rows } from "@/components/deal-bits";
import { ProposePanel, RespondPanel } from "@/components/deal-response";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
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
  const title = proposing ? "Đề xuất mức trừ" : responding ? "Trả lời đề xuất" : "Báo cáo AI";

  return (
    <>
      <NetworkBanner />
      <main className="mx-auto min-h-dvh max-w-md px-5 pb-48">
        <PageHeader href={back} backLabel="Về hợp đồng" title={title} />
        <div className="mt-2 space-y-7">
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <DealStatusBadge state={d.onchain.state} />
              <span className="truncate text-sm text-muted-foreground">Hợp đồng #{d.dealId}</span>
            </div>
            <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-balance text-primary">
              {d.terms.room.title}
            </h1>
          </section>

          <DeadlineLine deal={d} onExpire={() => deal.refetch()} />

          <AiSection deal={d} role={role} ai={ai.data} loading={ai.isPending} onRetry={() => ai.refetch()} />

          {proposing && (
            // key: khi AI xong (có con dấu mới) thì dựng lại form để điền sẵn đúng aiAmount.
            <ProposePanel
              key={ai.data?.seal?.reportHash ?? ai.data?.status ?? "loading"}
              deal={d}
              ai={ai.data}
              aiLoading={ai.isPending}
              back={back}
            />
          )}
          {responding && <RespondPanel deal={d} back={back} />}
        </div>
      </main>
    </>
  );
}

// ------------------------------------------------------------------ hạn chót

function DeadlineLine({ deal, onExpire }: { deal: DealView; onExpire: () => void }) {
  const info = deadlineInfo(deal.onchain.state, true);
  const { passed, msLeft } = useCountdown(deal.onchain.deadline, onExpire);
  if (!info || msLeft === null) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl px-4 py-3 ring-1",
        passed ? "bg-destructive/5 ring-destructive/20" : "bg-warning/10 ring-warning/30",
      )}
    >
      <Hourglass className="size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground/80">{info.waiting}</p>
        <p className="text-xs text-muted-foreground">Hết hạn: {info.onTimeout}</p>
      </div>
      <p className={cn("text-lg font-extrabold tabular-nums", passed ? "text-destructive" : "text-primary")}>
        {passed ? "Quá hạn" : formatDuration(msLeft)}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ báo cáo AI

function AiSection({
  deal,
  role,
  ai,
  loading,
  onRetry,
}: {
  deal: DealView;
  role: Role;
  ai: DamageAiResponse | undefined;
  loading: boolean;
  onRetry: () => void;
}) {
  const report = ai?.report ?? deal.reports.damage;
  const status = ai?.status ?? deal.aiStatus.damage ?? "none";
  const explanation = ai?.explanation ?? deal.explanation;

  return (
    <section aria-labelledby="ai-report" className="space-y-4">
      <h2 id="ai-report" className="flex items-center gap-2 text-lg font-bold">
        <Sparkles className="size-5 text-primary" /> AI so ảnh trước và sau
      </h2>

      {report ? (
        <ReportSummary deal={deal} report={report} sealed={!!ai?.seal || deal.onchain.hasAiSeal} />
      ) : loading ? (
        <Skeleton className="h-32 w-full rounded-2xl" />
      ) : (
        <AiStatusBox deal={deal} role={role} status={status} error={ai?.error} onRetry={onRetry} />
      )}

      <ul className="space-y-4">
        {deal.terms.positions.map((p) => (
          <PositionCard
            key={p.id}
            deal={deal}
            position={p}
            result={report?.positions.find((r) => r.positionId === p.id) ?? null}
          />
        ))}
      </ul>

      {report && explanation && (
        <details className="group rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
          <summary className="cursor-pointer list-none font-semibold text-primary">
            Giải thích thêm của AI <span className="font-normal text-muted-foreground">(chỉ để tham khảo)</span>
          </summary>
          <p className="mt-2 text-sm text-foreground/80">{explanation}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Đoạn này không nằm trong báo cáo đã ký. Con số tính tiền chỉ lấy từ bảng ở trên.
          </p>
        </details>
      )}
    </section>
  );
}

/** Chưa có báo cáo: AI đang chạy, bị lỗi, hoặc chưa ai bấm chạy. */
function AiStatusBox({
  deal,
  role,
  status,
  error,
  onRetry,
}: {
  deal: DealView;
  role: Role;
  status: DamageAiResponse["status"];
  error?: string;
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

  const noSealNote =
    role === "landlord" && deal.onchain.state === "CHECKED_OUT"
      ? " Bạn vẫn đề xuất được, nhưng đề xuất sẽ không có con dấu AI."
      : "";

  if (status === "processing") {
    return (
      <InfoBox icon={<Loader2 className="size-5 animate-spin" />} title="AI đang so ảnh…">
        Thường mất dưới 1 phút. Màn này tự cập nhật.
      </InfoBox>
    );
  }

  return (
    <InfoBox
      icon={<AlertTriangle className="size-5" />}
      tone="warning"
      title={status === "failed" ? "AI chưa so được ảnh" : "Chưa chạy AI so ảnh"}
    >
      <p>
        {status === "failed" ? (error ? `${error} ` : "Máy chủ AI gặp lỗi. ") : "Chưa có ai bấm chạy AI. "}
        {noSealNote}
      </p>
      {canStart && (
        <Button size="sm" variant="outline" className="mt-2" disabled={starting} onClick={start}>
          {starting ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {status === "failed" ? "Chạy lại AI" : "Chạy AI so ảnh"}
        </Button>
      )}
      {startError && <p className="mt-1 font-medium text-destructive">{startError}</p>}
    </InfoBox>
  );
}

function ReportSummary({ deal, report, sealed }: { deal: DealView; report: DamageReport; sealed: boolean }) {
  const rate = useVndRate();
  const vnd = (a: Amount) => formatVnd(amountToVnd(a, rate));
  const count = (v: DamageVerdict) => report.positions.filter((p) => p.verdict === v).length;
  const outside = report.positions.filter((p) => p.outsidePriceList).length;
  const capped = BigInt(report.totalAmount) > BigInt(report.sealedAmount);

  const parts = (
    [
      ["NEW_DAMAGE", "hư hỏng mới"],
      ["UNCLEAR", "không rõ"],
      ["WEAR", "hao mòn"],
      ["NO_CHANGE", "không đổi"],
    ] as const
  )
    .map(([v, label]) => [count(v), label] as const)
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`);

  return (
    <div className="space-y-3">
      <Rows>
        <Row label="AI tính mức trừ" value={vnd(report.sealedAmount)} sub={formatToken(report.sealedAmount)} strong />
        {capped && <Row label="Tổng hư hỏng" value={vnd(report.totalAmount)} sub="vượt tiền cọc, chỉ tính bằng cọc" />}
        <Row label="Tiền cọc" value={vnd(deal.onchain.deposit)} />
      </Rows>
      <p className="text-sm text-muted-foreground">{parts.join(" · ")}</p>
      {sealed && (
        <InfoBox icon={<ShieldCheck className="size-5" />} tone="success" title="Có con dấu AI">
          Con số trên được máy chủ AI ký. Contract tự kiểm tra chữ ký, không ai sửa được.
          <span className="mt-1 block text-xs text-muted-foreground">
            {report.model} · {report.promptVersion}
          </span>
        </InfoBox>
      )}
      {outside > 0 && (
        <InfoBox icon={<AlertTriangle className="size-5" />} tone="warning" title={`${outside} hư hỏng ngoài bảng giá`}>
          AI chỉ gắn nhãn, không cộng vào con số đã ký. Chủ trọ có thể tự cộng vào đề xuất; người thuê có quyền kháng
          nghị.
        </InfoBox>
      )}
    </div>
  );
}

export const VERDICT: Record<DamageVerdict, { label: string; cls: string }> = {
  NEW_DAMAGE: { label: "Hư hỏng mới", cls: "bg-destructive/10 text-destructive" },
  WEAR: { label: "Hao mòn tự nhiên", cls: "bg-secondary text-primary" },
  NO_CHANGE: { label: "Không đổi", cls: "bg-success/10 text-success" },
  UNCLEAR: { label: "Không rõ", cls: "bg-warning/15 text-foreground" },
};

function PositionCard({
  deal,
  position,
  result,
}: {
  deal: DealView;
  position: Position;
  result: DamagePosition | null;
}) {
  const rate = useVndRate();
  const [zoom, setZoom] = useState(false);
  const before = deal.photoSets.checkin?.items.find((i) => i.positionId === position.id)?.url || null;
  const after = deal.photoSets.checkout?.items.find((i) => i.positionId === position.id)?.url || null;
  const v = result ? VERDICT[result.verdict] : null;
  const price = result?.priceItemId ? deal.terms.priceList.find((i) => i.id === result.priceItemId) : undefined;
  const charged = result ? BigInt(result.amount) > 0n : false;

  return (
    <li
      className={cn(
        "space-y-3 rounded-2xl bg-card p-3 ring-1",
        charged ? "ring-destructive/30" : "ring-foreground/10",
      )}
    >
      <div className="flex items-start justify-between gap-2 px-1">
        <p className="font-semibold">{position.name}</p>
        {v && <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", v.cls)}>{v.label}</span>}
      </div>

      <button
        type="button"
        onClick={() => setZoom(true)}
        aria-label={`Phóng to ảnh ${position.name}`}
        className="grid w-full grid-cols-2 gap-2 rounded-xl text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <PhotoTile url={before} label="Nhận phòng" alt={`${position.name} lúc nhận phòng`} />
        <PhotoTile url={after} label="Trả phòng" alt={`${position.name} lúc trả phòng`} />
      </button>

      {result && (
        <div className="space-y-1.5 px-1 text-sm">
          <p className="text-foreground/90">{result.description}</p>
          <p className="text-xs text-muted-foreground">AI chắc chắn {Math.round(result.confidence * 100)}%</p>
          {price && charged && (
            <p className="flex items-baseline justify-between gap-3 rounded-lg bg-destructive/5 px-3 py-2">
              <span>
                {price.item} × {result.quantity} {price.unit}
              </span>
              <span className="font-bold text-destructive tabular-nums">
                {formatVnd(amountToVnd(result.amount, rate))}
              </span>
            </p>
          )}
          {result.outsidePriceList && (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs">
              Hư hỏng không có trong bảng giá: không cộng vào mức AI ký.
            </p>
          )}
          {result.verdict === "UNCLEAR" && (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs">AI không chắc nên không tính tiền vị trí này.</p>
          )}
        </div>
      )}

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto p-3 sm:max-w-md">
          <DialogTitle className="pr-8 text-base font-bold text-primary">{position.name}</DialogTitle>
          <DialogDescription className="sr-only">Ảnh nhận phòng ở trên, ảnh trả phòng ở dưới.</DialogDescription>
          <div className="space-y-3">
            <PhotoTile url={before} label="Nhận phòng" alt={`${position.name} lúc nhận phòng`} large />
            <PhotoTile url={after} label="Trả phòng" alt={`${position.name} lúc trả phòng`} large />
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}

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
    <main className="mx-auto min-h-dvh max-w-md space-y-5 px-5" aria-busy="true">
      <PageHeader href={back} backLabel="Về hợp đồng" title="Báo cáo AI" />
      <Skeleton className="h-8 w-4/5" />
      <Skeleton className="h-14 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="aspect-square rounded-xl" />
        <Skeleton className="aspect-square rounded-xl" />
      </div>
    </main>
  );
}
