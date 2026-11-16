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
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { zeroHash } from "viem";
import { AlertTriangle, Camera, CheckCircle2, Gavel, Hourglass, Loader2, Lock, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { CapturedPhoto } from "@/components/camera-capture";
import { PhotoTile } from "@/components/damage-report";
import { BottomBar, Blocked, InfoBox } from "@/components/deal-bits";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { PositionStrip, Review, ShootStep, SubmitProgress, type Shot } from "@/components/photo-capture-flow";
import { PokeButton } from "@/components/poke-button";
import { TxStatus } from "@/components/tx-status";
import { addresses, escrowAbi } from "@/lib/chain";
import { ApiClientError } from "@/lib/client/api";
import { deadlineInfo, roleOf, type Role } from "@/lib/client/deal-actions";
import { DEALS_MOCK, fetchDealView, NotFoundError, type DealView } from "@/lib/client/deals-data";
import { uploadPhoto } from "@/lib/client/listings-api";
import { fetchMismatchAi, startMismatchAi, type MismatchAiResponse } from "@/lib/client/mismatch-api";
import { amountToVnd, formatVnd } from "@/lib/client/money";
import { createPhotoSet } from "@/lib/client/photo-sets-api";
import { formatDuration, useCountdown } from "@/lib/client/use-countdown";
import { useTx } from "@/lib/client/use-tx";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import type { Hash, ListingVerdict, MismatchReport, Position } from "@/lib/types";
import { cn } from "@/lib/utils";

const TITLE = "Phòng không đúng mô tả";

const VERDICT_VIEW: Record<ListingVerdict, { label: string; tone: "danger" | "warning" | "success" }> = {
  MISMATCH: { label: "Khác rõ so với lúc đăng tin", tone: "danger" },
  UNCLEAR: { label: "AI không chắc chắn", tone: "warning" },
  MATCH: { label: "Giống lúc đăng tin", tone: "success" },
};

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
      <main className="mx-auto min-h-dvh max-w-md space-y-4 px-5" aria-busy="true">
        <PageHeader href={back} backLabel="Về hợp đồng" title={TITLE} />
        <Skeleton className="h-8 w-3/5" />
        <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
      </main>
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

// ------------------------------------------------------------------ người thuê: chụp, AI, ký

type Phase = "idle" | "uploading" | "sealing" | "ai" | "result" | "error";

function ReportFlow({ deal, back }: { deal: DealView; back: string }) {
  const positions = deal.terms.positions;
  const n = positions.length;
  const { getAccessToken } = usePrivy();

  // Đã chụp và chạy AI từ trước (tải lại trang, quay lại sau): mở thẳng kết quả, không bắt chụp lại.
  const prior = deal.photoSets.mismatch;
  const resume = !!prior?.photoSetId && deal.aiStatus.mismatch !== null;

  const [shots, setShots] = useState<Record<string, Shot>>({});
  const [step, setStep] = useState(0); // 0..n-1 = vị trí đang chụp, n = kiểm tra lại
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

  /** Bỏ kết quả cũ, chụp lại từ đầu. */
  function restart() {
    setSealed(null);
    setPhase("idle");
    setStep(0);
    setApiError("");
  }

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
        setHash={sealed.setHash}
        back={back}
        onRetryAi={async () => {
          await startMismatchAi(deal.dealId, sealed.photoSetId, await getAccessToken()).catch(() => null);
          ai.refetch();
        }}
        onRestart={restart}
      />
    );
  }

  const reviewing = step >= n;
  const pos = positions[Math.min(step, n - 1)];
  const missing = positions.filter((p) => !shots[p.id]);

  return (
    <>
      <NetworkBanner />
      <main className="mx-auto min-h-dvh max-w-md px-5 pb-44">
        <PageHeader
          href={back}
          backLabel="Về hợp đồng"
          title={TITLE}
          right={
            <span className="text-sm text-muted-foreground tabular-nums">{reviewing ? "Kiểm tra" : `${step + 1}/${n}`}</span>
          }
        />
        <PositionStrip positions={positions} shots={shots} step={step} onPick={busy ? undefined : setStep} />

        <p
          className={cn(
            "mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm",
            passed ? "bg-destructive/10 text-destructive" : "bg-secondary/60 text-foreground/80",
          )}
        >
          <Camera className="mt-0.5 size-4 shrink-0" />
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
          <Review deal={deal} shots={shots} kind="mismatch" onPick={busy ? undefined : setStep} />
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
          />
        )}
      </main>

      {reviewing && (
        <BottomBar>
          <SubmitProgress phase={phase} uploaded={uploadedCount} total={n} apiError={apiError} aiNote="" />
          <Button
            size="lg"
            className="h-14 w-full text-base"
            disabled={busy || missing.length > 0 || passed}
            onClick={submit}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {phase === "error" ? "Thử lại" : "Gửi ảnh cho AI so"}
          </Button>
        </BottomBar>
      )}
    </>
  );
}

/** Kết quả AI + ký reportMismatch. */
function ResultStep({
  deal,
  ai,
  loading,
  setHash,
  back,
  onRetryAi,
  onRestart,
}: {
  deal: DealView;
  ai: MismatchAiResponse | undefined;
  loading: boolean;
  setHash: Hash;
  back: string;
  onRetryAi: () => Promise<void>;
  onRestart: () => void;
}) {
  const tx = useTx();
  const qc = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const { passed } = useCountdown(deal.onchain.deadline);
  const busy = tx.state.phase === "signing" || tx.state.phase === "pending";
  const done = tx.state.phase === "success";

  const status = ai?.status;
  const seal = status === "done" ? ai!.seal : null;
  const report = status === "done" ? ai!.report : null;
  const failed = status === "failed" || status === "none";
  const waiting = loading || status === "processing";
  const match = seal?.verdict === 0;

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

  const next = qc.getQueryData<DealView>(["deal-view", deal.dealId])?.onchain.state;
  const signLabel = !seal ? "Ký, nhờ bồi thẩm xem" : seal.verdict === 2 ? "Ký báo phòng sai mô tả" : "Ký, nhờ bồi thẩm xem";

  return (
    <>
      <NetworkBanner />
      <main className="mx-auto min-h-dvh max-w-md px-5 pb-48">
        <PageHeader href={back} backLabel="Về hợp đồng" title={TITLE} />
        <div className="mt-2 space-y-6">
          <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-primary">Kết quả AI so ảnh</h1>

          {waiting && (
            <InfoBox icon={<Loader2 className="size-5 animate-spin" />} title="AI đang so với ảnh đăng tin…">
              Thường mất dưới một phút. Màn này tự cập nhật.
            </InfoBox>
          )}
          {!waiting && failed && (
            <InfoBox icon={<AlertTriangle className="size-5" />} tone="warning" title="AI chưa so được">
              <p>{ai?.error ?? "Máy chủ AI không trả lời."} Bạn có thể thử lại, hoặc ký luôn để bồi thẩm xem ảnh (không có phiếu AI).</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={retrying}
                onClick={async () => {
                  setRetrying(true);
                  await onRetryAi();
                  setRetrying(false);
                }}
              >
                {retrying ? <Loader2 className="animate-spin" /> : <RefreshCw />} Thử lại AI
              </Button>
            </InfoBox>
          )}
          {report && <VerdictCard report={report} />}

          {report && seal?.verdict === 2 && !done && (
            <InfoBox icon={<Hourglass className="size-5" />} title="Ký xong thì sao?">
              Chủ trọ có một khoảng thời gian để phản đối. Im lặng tới hạn thì bạn được hoàn đủ cọc. Phản đối thì bồi
              thẩm phân xử, và AI đã có 1 phiếu cho bạn.
            </InfoBox>
          )}
          {report && seal?.verdict === 1 && !done && (
            <InfoBox icon={<Gavel className="size-5" />} title="Ký xong thì sao?">
              Bồi thẩm xem ảnh và phân xử ngay. Vụ này không có phiếu AI.
            </InfoBox>
          )}
          {match && (
            <InfoBox icon={<CheckCircle2 className="size-5" />} tone="success" title="Không báo phòng sai được">
              AI thấy phòng giống lúc đăng tin, contract sẽ từ chối báo cáo này. Nếu ảnh chưa đúng góc, chụp lại. Nếu
              không, hãy gửi ảnh nhận phòng; quá hạn không gửi thì bạn được hoàn cọc trừ phí giữ chỗ.
            </InfoBox>
          )}
          {done && (
            <InfoBox icon={<CheckCircle2 className="size-5" />} tone="success" title="Đã báo phòng sai mô tả">
              {next === "DISPUTED" ? "Bồi thẩm sẽ xem ảnh và bỏ phiếu." : "Đang chờ chủ trọ phản hồi trước hạn."}
            </InfoBox>
          )}
        </div>
      </main>

      <BottomBar>
        {tx.state.phase !== "idle" && <TxStatus state={tx.state} doneText="Đã báo phòng sai mô tả" />}
        {done ? (
          <Button asChild size="lg" className="h-14 w-full text-base">
            <Link href={next === "DISPUTED" ? `/jury/${deal.dealId}` : back}>
              {next === "DISPUTED" ? "Xem phiếu bồi thẩm" : "Về hợp đồng"}
            </Link>
          </Button>
        ) : match ? (
          <>
            <Button asChild size="lg" className="h-14 w-full text-base">
              <Link href={`${back.split("?")[0]}/photos?kind=checkin`}>Chụp ảnh nhận phòng</Link>
            </Button>
            <Button size="lg" variant="outline" className="h-12 w-full text-base" onClick={onRestart}>
              <RefreshCw /> Chụp lại ảnh thực tế
            </Button>
          </>
        ) : (
          <>
            <Button
              size="lg"
              className="h-14 w-full text-base"
              disabled={busy || waiting || passed}
              onClick={sign}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Lock />}
              {passed ? "Đã quá hạn dọn vào" : tx.state.phase === "error" ? "Thử lại" : signLabel}
            </Button>
            {!busy && (
              <Button size="lg" variant="outline" className="h-12 w-full text-base" onClick={onRestart}>
                <RefreshCw /> Chụp lại ảnh thực tế
              </Button>
            )}
          </>
        )}
      </BottomBar>
    </>
  );
}

function VerdictCard({ report }: { report: MismatchReport }) {
  const v = VERDICT_VIEW[report.verdict];
  return (
    <InfoBox
      icon={<Sparkles className="size-5" />}
      tone={v.tone}
      title={`AI: ${v.label} · chắc chắn ${Math.round(report.confidence * 100)}%`}
    >
      {report.reasons.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4">
          {report.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </InfoBox>
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
  const o = deal.onchain;
  const waitingLandlord = o.state === "MISMATCH_REPORTED";
  const info = deadlineInfo(o.state, false);
  const { passed, msLeft } = useCountdown(waitingLandlord ? o.deadline : null, onExpire);
  const report = deal.reports.mismatch;
  const actual = (pid: string) => deal.photoSets.mismatch?.items.find((i) => i.positionId === pid)?.url || null;
  const canContest = role === "landlord" && waitingLandlord && !passed;

  return (
    <>
      <NetworkBanner />
      <main className="mx-auto min-h-dvh max-w-md px-5 pb-48">
        <PageHeader href={back} backLabel="Về hợp đồng" title={TITLE} />
        <div className="mt-2 space-y-6">
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <DealStatusBadge state={o.state} />
              <span className="text-sm text-muted-foreground">Hợp đồng #{deal.dealId}</span>
            </div>
            <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-balance text-primary">
              Người thuê báo phòng không đúng mô tả
            </h1>
            <p className="text-muted-foreground">{deal.terms.room.title}</p>
          </section>

          {waitingLandlord && info && msLeft !== null && (
            <div
              className={cn(
                "flex items-start gap-3 rounded-2xl px-4 py-3 ring-1",
                passed ? "bg-destructive/5 ring-destructive/20" : "bg-warning/10 ring-warning/30",
              )}
            >
              <Hourglass className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="text-sm">
                <p className="font-semibold">
                  {passed ? "Đã quá hạn phản đối" : <span className="tabular-nums">{info.waiting}: còn {formatDuration(msLeft)}</span>}
                </p>
                <p className="text-foreground/80">Hết hạn: {info.onTimeout}</p>
              </div>
            </div>
          )}

          {report ? (
            <VerdictCard report={report} />
          ) : (
            <InfoBox icon={<Sparkles className="size-5" />} title="Không có kết luận AI">
              Báo cáo được gửi không kèm con dấu AI.
            </InfoBox>
          )}

          <section aria-labelledby="mm-evidence" className="space-y-3">
            <h2 id="mm-evidence" className="text-lg font-bold">
              Ảnh lúc đăng tin và thực tế
            </h2>
            <ul className="space-y-3">
              {deal.terms.positions.map((p) => (
                <li key={p.id} className="space-y-2 rounded-2xl bg-card p-3 ring-1 ring-foreground/10">
                  <p className="px-1 font-semibold">{p.name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <PhotoTile
                      url={deal.examplePhotoUrls[p.id] ?? null}
                      label="Lúc đăng tin"
                      alt={`${p.name} lúc đăng tin`}
                    />
                    <PhotoTile url={actual(p.id)} label="Thực tế" alt={`${p.name} thực tế`} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {o.state === "DISPUTED" && (
            <InfoBox icon={<Gavel className="size-5" />} title="Bồi thẩm đang phân xử">
              Chủ trọ {o.votesLandlord} phiếu · Người thuê {o.votesTenant} phiếu. Bên nào đủ 2 phiếu thì thắng.
            </InfoBox>
          )}
        </div>
      </main>

      <BottomBar>
        <PokeButton deal={deal} receiptHref={`/deals/${deal.dealId}/receipt`} />
        {canContest && (
          <Button size="lg" className="h-14 w-full text-base" onClick={() => setContestOpen(true)}>
            <Gavel /> Phản đối, nhờ bồi thẩm
          </Button>
        )}
        {o.state === "DISPUTED" && (
          <Button asChild size="lg" variant="outline" className="h-12 w-full text-base">
            <Link href={`/jury/${deal.dealId}`}>Xem phiếu bồi thẩm</Link>
          </Button>
        )}
      </BottomBar>

      <ContestDrawer deal={deal} open={contestOpen} onClose={() => setContestOpen(false)} />
    </>
  );
}

/** Chủ trọ ký contestMismatch: mở tranh chấp loại MISMATCH, phiếu AI (nếu có con dấu) về người thuê. */
function ContestDrawer({ deal, open, onClose }: { deal: DealView; open: boolean; onClose: () => void }) {
  const rate = useVndRate();
  const vnd = (a: string) => formatVnd(amountToVnd(a, rate));
  const tx = useTx();
  const qc = useQueryClient();
  const busy = tx.state.phase === "signing" || tx.state.phase === "pending";
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
        <div className="mx-auto w-full max-w-md space-y-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="text-xl font-extrabold text-primary">Phản đối báo cáo này?</DrawerTitle>
            <DrawerDescription>
              Bồi thẩm sẽ so ảnh đăng tin với ảnh thực tế. {o.hasAiSeal && "AI kết luận phòng khác rõ nên đã có 1 phiếu cho người thuê. "}
              Bạn thắng: người thuê được hoàn cọc, bạn giữ phí giữ chỗ {vnd(o.reserveFee)}. Bạn thua: người thuê được
              hoàn đủ cọc.
            </DrawerDescription>
          </DrawerHeader>
          {tx.state.phase !== "idle" && <TxStatus state={tx.state} doneText="Đã phản đối, chờ bồi thẩm" />}
          {done ? (
            <Button asChild size="lg" className="h-14 w-full text-base">
              <Link href={`/jury/${deal.dealId}`}>Xem phiếu bồi thẩm</Link>
            </Button>
          ) : (
            <Button size="lg" className="h-14 w-full text-base" disabled={busy} onClick={submit}>
              {busy && <Loader2 className="animate-spin" />}
              {tx.state.phase === "error" ? "Thử lại" : "Ký phản đối"}
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
