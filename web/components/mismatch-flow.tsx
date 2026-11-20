"use client";
// Màn "Báo phòng không đúng" (nhánh C, docs/user-flow.md GĐ3, P1).
//
// Người thuê (RESERVED, chưa gửi ảnh nhận phòng, chưa quá hạn dọn vào):
//   chụp thực tế từng vị trí → POST /uploads (purpose=mismatch) → POST /photo-sets (kind=mismatch)
//   → POST /deals/:id/ai/mismatch → hỏi GET tới khi xong → ký reportMismatch(id, verdict, evidenceHash, reportHash, aiSig).
//   AI "khác rõ" (2): MISMATCH_REPORTED, chủ trọ có hạn phản đối, im lặng thì hoàn đủ cọc.
//   AI "không rõ" (1) hoặc AI lỗi (ký không con dấu): bồi thẩm ngay, không có phiếu AI.
//   AI "giống" (0): contract từ chối (BadVerdict), nên app không cho ký; người thuê quay lại nhận phòng.
// Chủ trọ (MISMATCH_REPORTED): xem ảnh đăng tin cạnh ảnh thực tế, kết luận AI, rồi phản đối (contestMismatch) trước hạn.
// Mọi người khác: chỉ xem bằng chứng.
//
// Bố cục (task 14, cùng bộ khung với Báo cáo AI của task 12): PageShell 1200px; mobile xếp hạn → kết luận → cặp ảnh
// → hành động, từ 1024px kết luận + hành động ở cột phải, cặp ảnh "lúc đăng tin / thực tế" ở cột trái. Phần chụp ảnh
// dùng lại ShootStep/Review của task 11. `MismatchResultView` và `MismatchEvidenceLayout` chỉ trình bày (không gọi
// ví, API hay chuỗi) để xem thử được bằng dữ liệu giả ở /dev/mismatch.
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { zeroHash } from "viem";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Gavel,
  Hourglass,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ActionArea } from "@/components/action-area";
import type { CapturedPhoto } from "@/components/camera-capture";
import { Blocked, InfoBox } from "@/components/deal-bits";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { EvidencePhoto } from "@/components/evidence-photo";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { PageColumns, PageShell } from "@/components/page-shell";
import { PositionStrip, Review, ShootStep, SubmitProgress, type Shot } from "@/components/photo-capture-flow";
import { PokeButton, useCanPoke } from "@/components/poke-button";
import { TxStatus } from "@/components/tx-status";
import { addresses, escrowAbi } from "@/lib/chain";
import { handOffShots, takeShots } from "@/lib/client/shot-handoff";
import { ApiClientError } from "@/lib/client/api";
import { deadlineInfo, roleOf, TERMINAL_STATES, type Role } from "@/lib/client/deal-actions";
import { DEALS_MOCK, fetchDealView, NotFoundError, type DealView } from "@/lib/client/deals-data";
import { fetchMismatchAi, startMismatchAi, type MismatchAiResponse } from "@/lib/client/mismatch-api";
import { amountToVnd, formatVnd } from "@/lib/client/money";
import { createPhotoSet } from "@/lib/client/photo-sets-api";
import { uploadPhoto } from "@/lib/client/listings-api";
import { formatDuration, useCountdown } from "@/lib/client/use-countdown";
import { useTx, type TxState } from "@/lib/client/use-tx";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import type { DealState, Hash, ListingVerdict, MismatchReport, Position } from "@/lib/types";
import { cn } from "@/lib/utils";

const TITLE = "Phòng không đúng mô tả";

const VERDICT_VIEW: Record<
  ListingVerdict,
  { label: string; tone: "danger" | "warning" | "success"; Icon: typeof CircleAlert }
> = {
  MISMATCH: { label: "Khác rõ so với lúc đăng tin", tone: "danger", Icon: CircleAlert },
  UNCLEAR: { label: "Ảnh chưa đủ rõ để kết luận", tone: "warning", Icon: CircleHelp },
  MATCH: { label: "Giống lúc đăng tin", tone: "success", Icon: CircleCheck },
};

const isBusy = (tx: TxState) => tx.phase === "signing" || tx.phase === "pending";

export function MismatchFlow({ dealId, previewAs }: { dealId: string; previewAs?: Role }) {
  const id = /^\d+$/.test(dealId) ? Number(dealId) : null;
  const { address } = useAccount();
  const back = id !== null ? `/deals/${id}${previewAs ? `?as=${previewAs}` : ""}` : "/";
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["deal-view", id],
    queryFn: () => fetchDealView(id!),
    enabled: id !== null,
    retry: (n, e) => !(e instanceof NotFoundError) && n < 2,
  });

  const role: Role | undefined = data && (DEALS_MOCK && previewAs ? previewAs : roleOf(data, address));
  const canReport = !!data && role === "tenant" && data.onchain.state === "RESERVED" && data.photoSets.checkin === null;
  // Đã vào luồng báo cáo thì giữ nguyên tới khi rời màn: ký xong deal đổi trạng thái, nhưng người thuê vẫn cần thấy
  // kết quả giao dịch (kèm link Snowtrace) thay vì bị đẩy sang màn khác.
  const [reporting, setReporting] = useState(false);
  if (canReport && !reporting) setReporting(true);

  if (id === null || error instanceof NotFoundError) {
    return <Blocked back="/" header={TITLE} title="Không tìm thấy hợp đồng này" text="Đường dẫn có thể bị sai." />;
  }
  if (error && !isPending) {
    return (
      <Blocked back={back} header={TITLE} title="Không tải được hợp đồng" text="Kiểm tra mạng rồi thử lại.">
        <Button onClick={() => refetch()}>Thử lại</Button>
      </Blocked>
    );
  }
  if (!data) {
    return (
      <PageShell aria-busy="true">
        <PageHeader href={back} backLabel="Về hợp đồng" title={TITLE} />
        <p role="status" className="sr-only">
          Đang tải hợp đồng…
        </p>
        <div className="mt-2 mb-6 space-y-3">
          <Skeleton className="h-6 w-32 rounded-full" />
          <Skeleton className="h-9 w-4/5" />
        </div>
        <PageColumns>
          <div className="space-y-6 lg:col-start-2">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
          <div className="space-y-5 lg:col-start-1 lg:row-start-1">
            <Skeleton className="h-6 w-48" />
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <Skeleton className="aspect-[4/3] rounded-xl" />
              <Skeleton className="aspect-[4/3] rounded-xl" />
            </div>
          </div>
        </PageColumns>
      </PageShell>
    );
  }

  const s = data.onchain.state;
  const reported =
    s === "MISMATCH_REPORTED" || (data.onchain.disputeKind === "MISMATCH" && data.photoSets.mismatch !== null);

  if (canReport || reporting) return <ReportFlow deal={data} back={back} />;
  if (reported) return <EvidenceView deal={data} role={role!} back={back} onExpire={() => refetch()} />;
  return (
    <Blocked
      back={back}
      header={TITLE}
      title={role === "tenant" && s === "RESERVED" ? "Đã gửi ảnh nhận phòng" : "Chưa có báo phòng sai mô tả"}
      text={
        role === "tenant" && s === "RESERVED"
          ? "Ảnh nhận phòng đã lên chuỗi nên không báo phòng sai được nữa."
          : "Chỉ người thuê báo được, sau khi gửi cọc và trước khi gửi ảnh nhận phòng."
      }
    />
  );
}

// ------------------------------------------------------------------ thành phần dùng chung

/** Đầu màn: trạng thái + tên phòng + một câu nói màn này làm gì. */
function Heading({ deal, title, intro }: { deal: DealView; title: string; intro: ReactNode }) {
  return (
    <header className="mt-2 mb-6 space-y-3 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <DealStatusBadge state={deal.onchain.state} />
        <span className="text-sm text-muted-foreground">Hợp đồng #{deal.dealId}</span>
      </div>
      <h1 className="max-w-[36ch] text-2xl leading-snug font-extrabold tracking-tight text-balance text-primary sm:text-3xl">
        {title}
      </h1>
      <p className="text-muted-foreground">{deal.terms.room.title}</p>
      <p className="max-w-[65ch] text-foreground/80">{intro}</p>
    </header>
  );
}

/** Dòng hạn chót: ai đang phải làm gì, còn bao lâu, hết hạn thì sao. */
function DeadlineLine({
  deadline,
  info,
  onExpire,
}: {
  deadline: string | null;
  info: { waiting: string; onTimeout: string } | null;
  onExpire?: () => void;
}) {
  const { passed, msLeft } = useCountdown(deadline, onExpire);
  if (!info || msLeft === null) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl px-4 py-3 ring-1",
        passed ? "bg-destructive/5 ring-destructive/20" : "bg-warning/10 ring-warning/30",
      )}
    >
      <Hourglass className="size-5 shrink-0 text-primary" aria-hidden="true" />
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

/** Kết luận AI: nhãn chữ + biểu tượng (không chỉ màu), độ chắc chắn, lý do. */
function VerdictCard({ report }: { report: MismatchReport }) {
  const v = VERDICT_VIEW[report.verdict];
  return (
    <InfoBox
      icon={<v.Icon className="size-5" aria-hidden="true" />}
      tone={v.tone}
      title={`AI: ${v.label} · chắc chắn ${Math.round(report.confidence * 100)}%`}
    >
      {report.reasons.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-4">
          {report.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : (
        <p>AI không nêu lý do cụ thể.</p>
      )}
    </InfoBox>
  );
}

/** Cặp ảnh theo vị trí: lúc đăng tin (chủ trọ) cạnh thực tế (người thuê). Ảnh hiện đủ khung, có link ảnh gốc. */
function ComparePairs({
  deal,
  actualUrls,
}: {
  deal: DealView;
  /** Ảnh vừa chụp trong phiên này (chưa có URL từ máy chủ). Thiếu thì lấy từ bộ ảnh đã khóa. */
  actualUrls?: Record<string, string>;
}) {
  const actualOf = (pid: string) =>
    actualUrls?.[pid] || deal.photoSets.mismatch?.items.find((i) => i.positionId === pid)?.url || null;
  return (
    <section aria-labelledby="mm-pairs" className="space-y-4">
      <div className="space-y-1">
        <h2 id="mm-pairs" className="text-lg font-bold">
          Ảnh lúc đăng tin và thực tế
        </h2>
        <p className="max-w-[65ch] text-sm text-muted-foreground">
          Mỗi vị trí có hai ảnh cùng góc: chủ trọ chụp lúc đăng tin, người thuê chụp khi đến phòng. Ảnh hiện đủ khung,
          không cắt; mở ảnh gốc để xem rõ chi tiết.
        </p>
      </div>
      <ul className="space-y-5">
        {deal.terms.positions.map((p, i) => {
          const listed = deal.examplePhotoUrls[p.id] || null;
          const actual = actualOf(p.id);
          return (
            <li key={p.id} className="space-y-4 rounded-2xl border bg-card p-4 [overflow-wrap:anywhere]">
              <h3 className="font-semibold">
                <span className="mr-2 text-sm font-normal text-muted-foreground tabular-nums">{i + 1}.</span>
                {p.name}
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <EvidencePhoto
                  label="Lúc đăng tin"
                  url={listed}
                  alt={`Ảnh đăng tin: ${p.name}`}
                  empty={listed ? null : "Chủ trọ không đăng ảnh vị trí này"}
                />
                <EvidencePhoto
                  label="Thực tế (người thuê chụp)"
                  url={actual}
                  alt={`Ảnh thực tế: ${p.name}`}
                  empty={actual ? null : "Không có ảnh vị trí này"}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ người thuê: chụp, AI, ký

type Phase = "idle" | "uploading" | "sealing" | "ai" | "result" | "error";

function ReportFlow({ deal, back }: { deal: DealView; back: string }) {
  const positions = deal.terms.positions;
  const n = positions.length;
  const { getAccessToken } = usePrivy();

  // Đã chụp và chạy AI từ trước (tải lại trang, quay lại sau): mở thẳng kết quả, không bắt chụp lại.
  const prior = deal.photoSets.mismatch;
  const resume = !!prior?.photoSetId && deal.aiStatus.mismatch !== null;

  // Đi từ màn "Gửi ảnh nhận phòng": dùng đúng bộ ảnh vừa chụp, không bắt chụp lại, và cho AI so ngay.
  const [handed] = useState(() => (resume ? null : takeShots(deal.dealId)));
  const [shots, setShots] = useState<Record<string, Shot>>(() => handed ?? {});
  const [step, setStep] = useState(handed ? n : 0); // 0..n-1 = vị trí đang chụp, n = kiểm tra lại
  const [phase, setPhase] = useState<Phase>(resume ? "result" : "idle");
  const [uploadedCount, setUploadedCount] = useState(0);
  const [apiError, setApiError] = useState("");
  const [sealed, setSealed] = useState<{ photoSetId: string; setHash: Hash } | null>(
    resume ? { photoSetId: prior!.photoSetId!, setHash: prior!.setHash } : null,
  );
  const uploaded = useRef<Record<string, { blob: Blob; photoId: string }>>({});

  const { passed, msLeft } = useCountdown(deal.onchain.deadline);
  const busy = phase === "uploading" || phase === "sealing" || phase === "ai";

  const ai = useQuery({
    queryKey: ["mismatch-ai", deal.dealId, sealed?.setHash],
    queryFn: () => fetchMismatchAi(deal.dealId),
    enabled: phase === "result" && !!sealed,
    refetchInterval: (q) => (q.state.data?.status === "processing" ? 3000 : false),
  });

  // Giải phóng object URL khi rời trang; hỏi trước khi đóng tab khi có ảnh chưa gửi.
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(() => () => Object.values(shotsRef.current).forEach((x) => URL.revokeObjectURL(x.previewUrl)), []);
  const dirty = Object.keys(shots).length > 0 && phase !== "result";
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  function capture(pos: Position, c: CapturedPhoto) {
    setShots((prev) => {
      if (prev[pos.id]) URL.revokeObjectURL(prev[pos.id].previewUrl);
      return { ...prev, [pos.id]: { blob: c.blob, capturedAt: c.capturedAt, previewUrl: URL.createObjectURL(c.blob) } };
    });
    delete uploaded.current[pos.id];
    setSealed(null);
    if (phase === "error") setPhase("idle");
  }

  function retake(pos: Position) {
    setShots((prev) => {
      if (!prev[pos.id]) return prev;
      URL.revokeObjectURL(prev[pos.id].previewUrl);
      const next = { ...prev };
      delete next[pos.id];
      return next;
    });
  }


  // Có bộ ảnh chuyển sang thì chạy AI luôn (một lần khi mở màn).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!handed || autoStarted.current) return;
    autoStarted.current = true;
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setApiError("");
    try {
      const token = await getAccessToken();
      let set = sealed;
      if (!set) {
        // 1. Tải từng ảnh lên (lần lượt: mạng trong phòng trọ thường yếu). Ảnh đã lên thì không tải lại.
        setPhase("uploading");
        let count = 0;
        for (const p of positions) {
          const shot = shots[p.id];
          const cached = uploaded.current[p.id];
          if (!cached || cached.blob !== shot.blob) {
            const up = await uploadPhoto(
              { blob: shot.blob, purpose: "mismatch", capturedAt: shot.capturedAt, positionKey: p.id },
              token,
            );
            uploaded.current[p.id] = { blob: shot.blob, photoId: up.photoId };
          }
          setUploadedCount(++count);
        }
        // 2. Server gom thành manifest, tính evidenceHash (AGENTS.md luật 5: chỉ API tính hash).
        setPhase("sealing");
        const res = await createPhotoSet(
          deal.dealId,
          { kind: "mismatch", items: positions.map((p) => ({ positionId: p.id, photoId: uploaded.current[p.id].photoId })) },
          token,
        );
        set = { photoSetId: res.photoSetId, setHash: res.setHash };
        setSealed(set);
      }
      // 3. Nhờ server chạy AI. Kết quả hỏi lại bằng GET (useQuery ở trên).
      setPhase("ai");
      await startMismatchAi(deal.dealId, set.photoSetId, token);
      setPhase("result");
    } catch (e) {
      setPhase("error");
      if (e instanceof ApiClientError && e.code === "MISSING_POSITIONS") {
        setApiError("Máy chủ báo còn thiếu vị trí chưa chụp. Kiểm tra lại từng vị trí.");
      } else if (e instanceof ApiClientError && e.code === "WRONG_STATE") {
        setApiError("Hợp đồng đã sang bước khác. Quay lại hợp đồng để xem trạng thái mới.");
      } else {
        setApiError(e instanceof ApiClientError ? e.message : "Có lỗi khi gửi ảnh. Thử lại nhé.");
      }
    }
  }

  if (phase === "result" && sealed) {
    return (
      <ResultStep
        deal={deal}
        ai={ai.data}
        loading={ai.isPending}
        loadFailed={ai.isError && !ai.data}
        setHash={sealed.setHash}
        actualUrls={Object.fromEntries(Object.entries(shots).map(([pid, s]) => [pid, s.previewUrl]))}
        back={back}
        onCheckin={() => { if (Object.keys(shots).length === n) handOffShots(deal.dealId, shots); }}
        onReloadAi={() => ai.refetch()}
        onRetryAi={async () => {
          // Lỗi ném tiếp cho ResultStep hiện lý do; dù sao cũng hỏi lại GET để thấy trạng thái mới nhất.
          try {
            await startMismatchAi(deal.dealId, sealed.photoSetId, await getAccessToken());
          } finally {
            ai.refetch();
          }
        }}
      />
    );
  }

  const reviewing = step >= n;
  const pos = positions[Math.min(step, n - 1)];
  const missing = positions.filter((p) => !shots[p.id]);
  const taken = n - missing.length;
  const picker = busy ? undefined : setStep;
  const blockReason = passed
    ? "Đã quá hạn dọn vào nên không gửi được nữa."
    : missing.length > 0
      ? `Còn ${missing.length} vị trí chưa chụp.`
      : "";

  return (
    <>
      <NetworkBanner />
      <PageShell>
        <PageHeader
          href={back}
          backLabel="Về hợp đồng"
          title={TITLE}
          right={
            <span className="text-sm text-muted-foreground tabular-nums">{reviewing ? "Kiểm tra" : `${step + 1}/${n}`}</span>
          }
        />
        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {deal.terms.room.title} · {n} vị trí cần chụp
        </p>
        <PositionStrip positions={positions} shots={shots} step={step} onPick={picker} />

        <p
          className={cn(
            "mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm",
            passed ? "bg-destructive/10 text-destructive" : "bg-secondary/60 text-foreground/80",
          )}
        >
          <Camera className="mt-0.5 size-4 shrink-0" aria-hidden />
          {passed ? (
            "Đã quá hạn dọn vào nên không báo phòng sai được nữa."
          ) : (
            <span>
              Chụp thực tế đúng các góc như ảnh lúc đăng tin. AI so hai bộ ảnh.
              {msLeft !== null && (
                <>
                  {" "}
                  Còn <b className="tabular-nums">{formatDuration(msLeft)}</b>.
                </>
              )}
            </span>
          )}
        </p>

        {reviewing ? (
          <PageColumns className="mt-4">
            <Review deal={deal} shots={shots} kind="mismatch" onPick={picker} />
            <div>
              <ActionArea>
                <SubmitProgress phase={phase} uploaded={uploadedCount} total={n} apiError={apiError} aiNote="" />
                {!busy && blockReason && (
                  <p id="mm-submit-hint" className="text-sm text-muted-foreground">
                    {blockReason}
                  </p>
                )}
                <Button
                  size="lg"
                  className="w-full text-base"
                  disabled={busy || missing.length > 0 || passed}
                  aria-describedby={!busy && blockReason ? "mm-submit-hint" : undefined}
                  onClick={submit}
                >
                  {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                  {phase === "error" ? "Thử lại" : "Gửi ảnh cho AI so"}
                </Button>
              </ActionArea>
            </div>
          </PageColumns>
        ) : (
          <ShootStep
            key={pos.id}
            deal={deal}
            kind="mismatch"
            pos={pos}
            shot={shots[pos.id] ?? null}
            onCapture={(c) => capture(pos, c)}
            onRetake={() => retake(pos)}
            onNext={() => setStep(step + 1)}
            isLast={step === n - 1}
            taken={taken}
          />
        )}
      </PageShell>
    </>
  );
}

/** /deals/:id?as=x → /deals/:id/photos?kind=checkin&as=x (giữ tham số xem thử vai như hrefFor ở Chi tiết hợp đồng). */
function checkinHref(back: string): string {
  const [path, query] = back.split("?");
  return `${path}/photos?kind=checkin${query ? `&${query}` : ""}`;
}

/** Kết quả AI + ký reportMismatch. Giữ state giao dịch và thử lại AI; phần trình bày ở MismatchResultView. */
function ResultStep({
  deal,
  ai,
  loading,
  loadFailed,
  setHash,
  actualUrls,
  back,
  onReloadAi,
  onRetryAi,
  onCheckin,
}: {
  deal: DealView;
  ai: MismatchAiResponse | undefined;
  loading: boolean;
  loadFailed: boolean;
  setHash: Hash;
  actualUrls: Record<string, string>;
  back: string;
  onReloadAi: () => void;
  onRetryAi: () => Promise<void>;
  /** AI thấy giống: mang bộ ảnh vừa chụp sang màn nhận phòng (AI đã so thì không chụp lại ảnh thực tế nữa). */
  onCheckin?: () => void;
}) {
  const rate = useVndRate();
  const tx = useTx();
  const qc = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const seal = ai?.status === "done" ? ai.seal : null;

  async function sign() {
    const receipt = await tx.run({
      address: addresses.escrow,
      abi: escrowAbi,
      functionName: "reportMismatch",
      // Không có con dấu (AI lỗi): chữ ký rỗng → contract coi như "không rõ" và mở bồi thẩm, không có phiếu AI.
      args: seal
        ? [BigInt(deal.dealId), seal.verdict, seal.evidenceHash, seal.reportHash, seal.signature]
        : [BigInt(deal.dealId), 1, setHash, zeroHash, "0x"],
    });
    if (receipt) await qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] });
  }

  async function retryAi() {
    setRetrying(true);
    setRetryError("");
    try {
      await onRetryAi();
    } catch (e) {
      setRetryError(e instanceof ApiClientError ? e.message : "Chưa gọi được AI. Thử lại sau một lát.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <>
      <NetworkBanner />
      <MismatchResultView
        deal={deal}
        rate={rate}
        ai={ai}
        loading={loading}
        loadFailed={loadFailed}
        actualUrls={actualUrls}
        tx={tx.state}
        nextState={qc.getQueryData<DealView>(["deal-view", deal.dealId])?.onchain.state}
        retrying={retrying}
        retryError={retryError}
        back={back}
        onSign={sign}
        onRetryAi={retryAi}
        onReloadAi={onReloadAi}
        onCheckin={onCheckin}
      />
    </>
  );
}

/** Thân màn kết quả AI của người thuê. Chỉ trình bày: mọi hành động đi qua props. */
export function MismatchResultView({
  deal,
  rate,
  ai,
  loading,
  loadFailed,
  actualUrls,
  tx,
  nextState,
  retrying,
  retryError,
  back,
  onSign,
  onRetryAi,
  onReloadAi,
  onCheckin,
}: {
  deal: DealView;
  rate: number;
  ai: MismatchAiResponse | undefined;
  loading: boolean;
  /** Không tải được kết quả AI (khác với "AI chưa chạy" hay "AI lỗi"). */
  loadFailed: boolean;
  actualUrls?: Record<string, string>;
  tx: TxState;
  nextState?: DealState;
  retrying: boolean;
  retryError: string;
  back: string;
  onSign: () => void;
  onRetryAi: () => void;
  onReloadAi: () => void;
  /** AI thấy giống: mang bộ ảnh vừa chụp sang màn nhận phòng (AI đã so thì không chụp lại ảnh thực tế nữa). */
  onCheckin?: () => void;
}) {
  const vnd = (a: string) => formatVnd(amountToVnd(a, rate));
  const { passed } = useCountdown(deal.onchain.deadline);
  const busy = isBusy(tx);
  const done = tx.phase === "success";

  const status = ai?.status;
  const seal = status === "done" ? ai!.seal : null;
  const report = status === "done" ? ai!.report : null;
  const failed = !loadFailed && (status === "failed" || status === "none");
  const waiting = !loadFailed && (loading || status === "processing");
  const match = seal?.verdict === 0;
  const canSign = !passed && !waiting && !loadFailed && !match;

  const signLabel = passed
    ? "Đã quá hạn dọn vào"
    : tx.phase === "error"
      ? "Thử lại"
      : !seal || seal.verdict !== 2
        ? "Ký, nhờ bồi thẩm xem"
        : "Ký báo phòng sai mô tả";

  return (
    <PageShell>
      <PageHeader href={back} backLabel="Về hợp đồng" title={TITLE} />
      <Heading
        deal={deal}
        title="Kết quả AI so ảnh"
        intro="AI so ảnh bạn chụp với ảnh chủ trọ đăng tin. Xem từng vị trí trước khi quyết định; báo cáo chỉ được tính khi bạn ký."
      />

      <PageColumns className="lg:grid-rows-[auto_1fr] lg:gap-y-4">
        <div className="min-w-0 space-y-6 lg:col-start-2 lg:row-start-1">
          <DeadlineLine deadline={deal.onchain.deadline} info={deadlineInfo("RESERVED", false)} />

          <section aria-labelledby="mm-ai" className="space-y-3" aria-busy={waiting}>
            <h2 id="mm-ai" className="flex items-center gap-2 text-lg font-bold">
              <Sparkles className="size-5 text-primary" aria-hidden="true" /> Kết luận của AI
            </h2>

            {waiting && (
              <div role="status">
                <InfoBox
                  icon={<Loader2 className="size-5 animate-spin motion-reduce:animate-none" />}
                  title="AI đang so với ảnh đăng tin…"
                >
                  Thường mất dưới một phút. Màn này tự cập nhật.
                </InfoBox>
              </div>
            )}

            {loadFailed && (
              <InfoBox icon={<AlertTriangle className="size-5" />} tone="warning" title="Chưa tải được kết quả AI">
                <p>Kiểm tra mạng rồi tải lại. Chưa có kết quả thì chưa ký được, ảnh của bạn vẫn đã được lưu.</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={onReloadAi}>
                  <RefreshCw /> Tải lại
                </Button>
              </InfoBox>
            )}

            {failed && (
              <InfoBox icon={<AlertTriangle className="size-5" />} tone="warning" title="AI chưa so được">
                <p>
                  {ai?.error ?? (status === "none" ? "AI chưa chạy cho bộ ảnh này." : "Máy chủ AI không trả lời.")} Bạn có
                  thể thử lại, hoặc ký luôn để bồi thẩm xem ảnh (không có phiếu AI).
                </p>
                <Button size="sm" variant="outline" className="mt-2" disabled={retrying} onClick={onRetryAi}>
                  {retrying ? <Loader2 className="animate-spin" /> : <RefreshCw />} Thử lại AI
                </Button>
                {retryError && (
                  <p role="alert" className="mt-1 font-medium text-destructive">
                    {retryError}
                  </p>
                )}
              </InfoBox>
            )}

            {report && <VerdictCard report={report} />}

            {passed && !done ? (
              <InfoBox icon={<Hourglass className="size-5" />} tone="danger" title="Đã quá hạn dọn vào">
                Không báo phòng sai được nữa. {deadlineInfo("RESERVED", false)!.onTimeout}
              </InfoBox>
            ) : (
              !done && (
                <>
                  {seal?.verdict === 2 && (
                    <InfoBox icon={<Hourglass className="size-5" />} title="Ký xong thì sao?">
                      Chủ trọ có một khoảng thời gian để phản đối. Im lặng tới hạn thì bạn được hoàn đủ cọc (
                      {vnd(deal.onchain.deposit)}). Phản đối thì bồi thẩm phân xử, và AI đã có 1 phiếu cho bạn.
                    </InfoBox>
                  )}
                  {(seal?.verdict === 1 || failed) && (
                    <InfoBox icon={<Gavel className="size-5" />} title="Ký xong thì sao?">
                      Bồi thẩm xem ảnh và phân xử ngay. Vụ này không có phiếu AI.
                    </InfoBox>
                  )}
                  {match && (
                    <InfoBox icon={<CheckCircle2 className="size-5" />} tone="success" title="Không báo phòng sai được">
                      AI thấy phòng giống lúc đăng tin, contract sẽ từ chối báo cáo này. Nếu ảnh chưa đúng góc, chụp lại.
                      Nếu không, hãy gửi ảnh nhận phòng; quá hạn không gửi thì bạn được hoàn cọc trừ phí giữ chỗ.
                    </InfoBox>
                  )}
                </>
              )
            )}
            {done && (
              <InfoBox icon={<CheckCircle2 className="size-5" />} tone="success" title="Đã báo phòng sai mô tả">
                {nextState === "DISPUTED" ? "Bồi thẩm sẽ xem ảnh và bỏ phiếu." : "Đang chờ chủ trọ phản hồi trước hạn."}
              </InfoBox>
            )}
          </section>
        </div>

        <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <ComparePairs deal={deal} actualUrls={actualUrls} />
        </div>

        <div className="min-w-0 lg:col-start-2 lg:row-start-2">
          <ActionArea>
            {tx.phase !== "idle" && <TxStatus state={tx} doneText="Đã báo phòng sai mô tả" />}
            {done ? (
              <Button asChild size="lg" className="w-full text-base">
                <Link href={nextState === "DISPUTED" ? `/jury/${deal.dealId}` : back}>
                  {nextState === "DISPUTED" ? "Xem phiếu bồi thẩm" : "Về hợp đồng"}
                </Link>
              </Button>
            ) : match ? (
              <>
                {passed ? (
                  <Button asChild size="lg" className="w-full text-base">
                    <Link href={back}>Về hợp đồng</Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild size="lg" className="w-full text-base">
                      <Link href={checkinHref(back)} onClick={onCheckin}>Quay lại nhận phòng</Link>
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                <Button size="lg" className="w-full text-base" disabled={busy || !canSign} onClick={onSign}>
                  {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Lock aria-hidden />}
                  {signLabel}
                </Button>
                {passed && (
                  <Button asChild size="lg" variant="outline" className="w-full text-base">
                    <Link href={back}>Về hợp đồng</Link>
                  </Button>
                )}
              </>
            )}
          </ActionArea>
        </div>
      </PageColumns>
    </PageShell>
  );
}

// ------------------------------------------------------------------ đã báo: xem bằng chứng, chủ trọ phản đối

function EvidenceView({
  deal,
  role,
  back,
  onExpire,
}: {
  deal: DealView;
  role: Role;
  back: string;
  onExpire: () => void;
}) {
  const [contestOpen, setContestOpen] = useState(false);
  return (
    <>
      <NetworkBanner />
      <MismatchEvidenceLayout
        deal={deal}
        role={role}
        back={back}
        onExpire={onExpire}
        onContest={() => setContestOpen(true)}
        drawer={<ContestDrawer deal={deal} open={contestOpen} onClose={() => setContestOpen(false)} />}
      />
    </>
  );
}

/** Thân màn bằng chứng (đã báo). Chỉ trình bày; mở drawer phản đối qua onContest. */
export function MismatchEvidenceLayout({
  deal,
  role,
  back,
  onExpire,
  onContest,
  drawer,
}: {
  deal: DealView;
  role: Role;
  back: string;
  onExpire: () => void;
  onContest: () => void;
  drawer?: ReactNode;
}) {
  const o = deal.onchain;
  const waitingLandlord = o.state === "MISMATCH_REPORTED";
  const { passed } = useCountdown(waitingLandlord ? o.deadline : null, onExpire);
  const canPoke = useCanPoke(deal);
  const report = deal.reports.mismatch;
  const canContest = role === "landlord" && waitingLandlord && !passed;
  const disputed = o.state === "DISPUTED";
  const ended = TERMINAL_STATES.includes(o.state);
  const hasAction = canPoke || canContest || disputed || ended;

  return (
    <PageShell>
      <PageHeader href={back} backLabel="Về hợp đồng" title={TITLE} />
      <Heading
        deal={deal}
        title="Người thuê báo phòng không đúng mô tả"
        intro="Cả hai bên thấy cùng một bộ ảnh: ảnh chủ trọ đăng tin cạnh ảnh người thuê chụp thực tế, và kết luận của AI."
      />

      <PageColumns className="lg:grid-rows-[auto_1fr] lg:gap-y-4">
        <div className="min-w-0 space-y-6 lg:col-start-2 lg:row-start-1">
          {waitingLandlord && (
            <DeadlineLine deadline={o.deadline} info={deadlineInfo(o.state, false)} onExpire={onExpire} />
          )}

          <section aria-labelledby="mm-ai" className="space-y-3">
            <h2 id="mm-ai" className="flex items-center gap-2 text-lg font-bold">
              <Sparkles className="size-5 text-primary" aria-hidden="true" /> Kết luận của AI
            </h2>
            {report ? (
              <VerdictCard report={report} />
            ) : (
              <InfoBox icon={<AlertTriangle className="size-5" />} tone="warning" title="Không có kết luận AI">
                Báo cáo được gửi không kèm con dấu AI nên bồi thẩm xem ảnh và quyết định, không có phiếu AI.
              </InfoBox>
            )}
          </section>

          <NextStep deal={deal} role={role} passed={passed} />
        </div>

        <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <ComparePairs deal={deal} />
        </div>

        {hasAction && (
          <div className="min-w-0 lg:col-start-2 lg:row-start-2">
            <ActionArea>
              <PokeButton deal={deal} receiptHref={`/deals/${deal.dealId}/receipt`} />
              {canContest && (
                <Button size="lg" className="w-full text-base" onClick={onContest}>
                  <Gavel aria-hidden /> Phản đối, nhờ bồi thẩm
                </Button>
              )}
              {disputed && (
                <Button asChild size="lg" variant="outline" className="w-full text-base">
                  <Link href={`/jury/${deal.dealId}`}>Xem phiếu bồi thẩm</Link>
                </Button>
              )}
              {ended && (
                <Button asChild size="lg" variant="outline" className="w-full text-base">
                  <Link href={`/deals/${deal.dealId}/receipt`}>Xem biên nhận</Link>
                </Button>
              )}
            </ActionArea>
          </div>
        )}
      </PageColumns>
      {drawer}
    </PageShell>
  );
}

/** "Điều gì xảy ra tiếp" theo trạng thái và vai: không bắt người xem tự suy ra hệ quả của hạn chót. */
function NextStep({ deal, role, passed }: { deal: DealView; role: Role; passed: boolean }) {
  const o = deal.onchain;
  const rate = useVndRate();
  const vnd = (a: string) => formatVnd(amountToVnd(a, rate));

  if (o.state === "MISMATCH_REPORTED") {
    if (passed) {
      return (
        <InfoBox icon={<Hourglass className="size-5" />} title="Đã hết hạn phản đối">
          Chủ trọ không còn phản đối được. Hợp đồng đang tự hoàn đủ cọc cho người thuê ({vnd(o.deposit)}).
        </InfoBox>
      );
    }
    return role === "landlord" ? (
      <InfoBox icon={<Gavel className="size-5" />} title="Bạn có thể phản đối">
        Xem ảnh hai bên rồi quyết định. Phản đối thì bồi thẩm phân xử. Không làm gì tới hạn thì người thuê được hoàn đủ
        cọc ({vnd(o.deposit)}).
      </InfoBox>
    ) : (
      <InfoBox icon={<Hourglass className="size-5" />} title="Đang chờ chủ trọ">
        Chủ trọ có hạn để phản đối. Im lặng tới hạn thì người thuê được hoàn đủ cọc ({vnd(o.deposit)}). Phản đối thì
        bồi thẩm phân xử{o.hasAiSeal ? ", và AI đã có 1 phiếu cho người thuê" : ""}.
      </InfoBox>
    );
  }
  if (o.state === "DISPUTED") {
    return (
      <InfoBox icon={<Gavel className="size-5" />} title="Bồi thẩm đang phân xử">
        Chủ trọ {o.votesLandlord} phiếu · Người thuê {o.votesTenant} phiếu. Bên nào đủ 2 phiếu thì thắng.
      </InfoBox>
    );
  }
  if (TERMINAL_STATES.includes(o.state)) {
    return (
      <InfoBox icon={<CheckCircle2 className="size-5" />} tone="success" title="Vụ này đã kết thúc">
        Tiền đã được chia theo kết quả. Xem biên nhận để biết từng bên nhận bao nhiêu.
      </InfoBox>
    );
  }
  return null;
}

/** Chủ trọ ký contestMismatch: mở tranh chấp loại MISMATCH, phiếu AI (nếu có con dấu) về người thuê. */
function ContestDrawer({ deal, open, onClose }: { deal: DealView; open: boolean; onClose: () => void }) {
  const rate = useVndRate();
  const vnd = (a: string) => formatVnd(amountToVnd(a, rate));
  const tx = useTx();
  const qc = useQueryClient();
  const busy = isBusy(tx.state);
  const done = tx.state.phase === "success";
  const o = deal.onchain;

  async function submit() {
    const receipt = await tx.run({
      address: addresses.escrow,
      abi: escrowAbi,
      functionName: "contestMismatch",
      args: [BigInt(deal.dealId)],
    });
    if (receipt) await qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] });
  }

  function change(next: boolean) {
    if (next || busy) return; // đang ký/chờ chuỗi: không cho đóng để khỏi mất dấu giao dịch
    onClose();
    tx.reset();
  }

  return (
    <Drawer open={open} onOpenChange={change}>
      <DrawerContent>
        <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-5">
          {/* Nội dung cuộn; nút ký + kết quả giao dịch ghim ở đáy để lỗi và nút Thử lại luôn thấy. */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <DrawerHeader className="px-0 text-left">
              <DrawerTitle className="text-xl font-extrabold text-primary">Phản đối báo cáo này?</DrawerTitle>
              <DrawerDescription>
                Bồi thẩm sẽ so ảnh đăng tin với ảnh thực tế.{" "}
                {o.hasAiSeal && "AI kết luận phòng khác rõ nên đã có 1 phiếu cho người thuê."}
              </DrawerDescription>
            </DrawerHeader>
            <ul className="space-y-2 text-sm">
              <li className="rounded-xl bg-success/10 px-3 py-2">
                <b>Bạn thắng:</b> người thuê được hoàn cọc, bạn giữ phí giữ chỗ {vnd(o.reserveFee)}.
              </li>
              <li className="rounded-xl bg-secondary/60 px-3 py-2">
                <b>Bạn thua:</b> người thuê được hoàn đủ cọc.
              </li>
            </ul>
          </div>
          <div className="space-y-2 border-t bg-popover pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {tx.state.phase !== "idle" && <TxStatus state={tx.state} doneText="Đã phản đối, chờ bồi thẩm" />}
            {done ? (
              <Button asChild size="lg" className="w-full text-base">
                <Link href={`/jury/${deal.dealId}`}>Xem phiếu bồi thẩm</Link>
              </Button>
            ) : (
              <Button size="lg" className="w-full text-base" disabled={busy} onClick={submit}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                {tx.state.phase === "error" ? "Thử lại" : "Ký phản đối"}
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
