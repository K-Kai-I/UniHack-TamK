"use client";
// Màn "Camera chụp theo vị trí" (docs/user-flow.md GĐ3 và GĐ5, P0). Chụp lần lượt từng vị trí trong điều khoản,
// mỗi vị trí có hướng dẫn góc chụp và ảnh tham chiếu, rồi gửi cả bộ:
//   POST /uploads từng ảnh → POST /deals/:id/photo-sets (setHash) → ký submitCheckIn / submitCheckOut
//   → trả phòng thì gọi thêm POST /deals/:id/ai/damage.
// Lớp ảnh cũ mờ đè lên khung là P2: bản này chỉ hiện ảnh cũ nhỏ bên cạnh. GPS (P2) chưa gửi.
//
// Bố cục (DESIGN.md, khung "Camera"): một cây DOM cho mọi kích thước. Mobile xếp hướng dẫn → camera → ảnh tham chiếu;
// từ ~1024px camera và ảnh tham chiếu thành hai cột bằng nhau. Chỉ đổi bằng CSS (container query), không dựng lại
// camera hay mất ảnh đã chụp khi xoay màn hình hoặc đổi cỡ cửa sổ. Bước kiểm tra có vùng hành động duy nhất (ActionArea).
import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Circle, ExternalLink, Hourglass, Loader2, Lock, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionArea } from "@/components/action-area";
import { CameraCapture, type CapturedPhoto } from "@/components/camera-capture";
import { Blocked } from "@/components/deal-bits";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { PageColumns, PageShell } from "@/components/page-shell";
import { RoomCover } from "@/components/room-cover";
import { SuccessScreen } from "@/components/success-screen";
import { handOffShots, takeShots } from "@/lib/client/shot-handoff";
import { TxStatus } from "@/components/tx-status";
import { addresses, escrowAbi } from "@/lib/chain";
import { ApiClientError } from "@/lib/client/api";
import { actionsFor, roleOf, type ActionId, type Role } from "@/lib/client/deal-actions";
import { DEALS_MOCK, fetchDealView, NotFoundError, type DealView } from "@/lib/client/deals-data";
import { uploadPhoto } from "@/lib/client/listings-api";
import { createPhotoSet, startDamageAi } from "@/lib/client/photo-sets-api";
import { useCheckOutGrace } from "@/lib/client/use-config";
import { formatDuration, useCountdown } from "@/lib/client/use-countdown";
import { useTx } from "@/lib/client/use-tx";
import type { Hash, Position } from "@/lib/types";
import { cn } from "@/lib/utils";

export type CaptureKind = "checkin" | "checkout";
/** Các khối chụp bên dưới dùng chung cho cả màn "Báo phòng không đúng" (components/mismatch-flow.tsx). */
export type ShotKind = CaptureKind | "mismatch";

const COPY = {
  checkin: { title: "Ảnh nhận phòng", submit: "Gửi ảnh nhận phòng", done: "Đã gửi ảnh nhận phòng" },
  checkout: { title: "Ảnh trả phòng", submit: "Gửi ảnh trả phòng", done: "Đã gửi ảnh trả phòng" },
} as const;

/** Nhãn và lời nhắc của ảnh tham chiếu theo nguồn: ảnh nhận phòng đã khóa, ảnh ví dụ, hay ảnh đăng tin. */
const REFERENCE = {
  checkin: { label: "Ảnh ví dụ của chủ trọ", note: "Chụp theo góc này.", missing: "Chủ trọ chưa có ảnh ví dụ cho vị trí này. Chụp theo hướng dẫn ở trên." },
  checkout: {
    label: "Lúc nhận phòng",
    note: "Ảnh đã gửi và khóa lúc nhận phòng. Chụp đúng góc này.",
    missing: "Không có ảnh nhận phòng cho vị trí này. Chụp theo hướng dẫn ở trên.",
  },
  mismatch: {
    label: "Lúc đăng tin",
    note: "Ảnh chủ trọ đăng tin. Chụp thực tế đúng góc này.",
    missing: "Chủ trọ chưa có ảnh ví dụ cho vị trí này. Chụp theo hướng dẫn ở trên.",
  },
} as const;

/** Khung ảnh không cao quá 70% màn hình, cùng công thức với khung camera để hai cột bằng nhau. */
const FRAME_CAP = "mx-auto w-full max-w-[min(100%,calc(70dvh*0.75))]";

export interface Shot {
  blob: Blob;
  capturedAt: string;
  previewUrl: string;
}

type Phase = "idle" | "uploading" | "sealing" | "signing" | "ai" | "done" | "error";

export function PhotoCaptureFlow({ dealId, kind, previewAs }: { dealId: string; kind: CaptureKind; previewAs?: Role }) {
  const id = /^\d+$/.test(dealId) ? Number(dealId) : null;
  const { address } = useAccount();
  // Cùng queryKey với màn Chi tiết hợp đồng: mở từ đó thì có dữ liệu ngay, không tải lại.
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["deal-view", id],
    queryFn: () => fetchDealView(id!),
    enabled: id !== null,
    retry: (n, e) => !(e instanceof NotFoundError) && n < 2,
  });
  const { now } = useCountdown(null);
  const checkOutGrace = useCheckOutGrace();

  const back = id !== null ? `/deals/${id}${previewAs ? `?as=${previewAs}` : ""}` : "/";

  if (id === null || error instanceof NotFoundError) {
    return <Blocked back={back} title="Không tìm thấy hợp đồng này" text="Đường dẫn có thể bị sai." />;
  }
  if (error && !isPending) {
    return (
      <Blocked back={back} title="Không tải được hợp đồng" text="Kiểm tra mạng rồi thử lại.">
        <Button onClick={() => refetch()}>Thử lại</Button>
      </Blocked>
    );
  }
  if (!data) {
    return (
      <PageShell aria-busy="true">
        <PageHeader href={back} backLabel="Về hợp đồng" title={COPY[kind].title} />
        <p className="sr-only" role="status">
          Đang tải hợp đồng…
        </p>
        <Skeleton className="mt-2 h-10 w-full" />
        <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:gap-8">
          <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
          <Skeleton className="hidden aspect-[3/4] w-full rounded-2xl lg:block" />
        </div>
      </PageShell>
    );
  }

  // Chỉ mở camera khi contract đang chờ đúng bước này từ đúng người (bảng "Nút trên app theo trạng thái").
  const role: Role = DEALS_MOCK && previewAs ? previewAs : roleOf(data, address);
  const need: ActionId[] = kind === "checkin" ? ["checkin"] : ["checkout", "checkoutForTenant"];
  const allowed = actionsFor(data, role, now, checkOutGrace).some((a) => need.includes(a.id));
  if (!allowed) {
    return (
      <Blocked
        back={back}
        title="Chưa tới bước chụp ảnh này"
        text={
          kind === "checkin"
            ? "Chỉ người thuê chụp ảnh nhận phòng, sau khi đã gửi cọc và trước khi gửi ảnh."
            : "Người thuê trả phòng khi đang ở. Chủ trọ chỉ trả phòng thay sau khi hết hạn thuê và hết thời gian chờ."
        }
      />
    );
  }

  return <Flow deal={data} kind={kind} back={back} />;
}

// ------------------------------------------------------------------ luồng chụp

function Flow({ deal, kind, back }: { deal: DealView; kind: CaptureKind; back: string }) {
  const positions = deal.terms.positions;
  const n = positions.length;
  const qc = useQueryClient();
  const { getAccessToken } = usePrivy();
  const tx = useTx();

  // Quay lại từ màn "Phòng không giống mô tả" (AI thấy giống): dùng lại đúng bộ ảnh đã chụp, mở thẳng màn kiểm tra.
  const [handed] = useState(() => {
    const got = kind === "checkin" ? takeShots(deal.dealId) : null;
    return got && positions.every((p) => got[p.id]) ? got : null;
  });
  const [shots, setShots] = useState<Record<string, Shot>>(() => handed ?? {});
  const [step, setStep] = useState(handed ? n : 0); // 0..n-1 = vị trí đang chụp, n = màn kiểm tra lại
  const [phase, setPhase] = useState<Phase>("idle");
  const router = useRouter();
  const [failedAt, setFailedAt] = useState<Phase | null>(null); // bước đang chạy khi lỗi, để đánh dấu đúng bước hỏng
  const [uploadedCount, setUploadedCount] = useState(0);
  const [apiError, setApiError] = useState("");
  const [aiNote, setAiNote] = useState("");
  const phaseNow = useRef<Phase>("idle");

  function go(p: Phase) {
    phaseNow.current = p;
    setPhase(p);
  }
  function fail() {
    setFailedAt(phaseNow.current);
    go("error");
  }

  // Ảnh đã tải lên và bộ ảnh đã khóa được giữ lại khi thử lại, để không tải lại ảnh đã lên.
  // Chụp lại một vị trí thì xóa cache của vị trí đó và bộ ảnh.
  const uploaded = useRef<Record<string, { blob: Blob; photoId: string }>>({});
  const sealed = useRef<{ setHash: Hash } | null>(null);

  // Hạn chót chỉ có ở nhận phòng (moveInDate + moveInGrace). Trả phòng ở ACTIVE không có hạn.
  const { passed, msLeft } = useCountdown(kind === "checkin" ? deal.onchain.deadline : null);
  const busy = phase === "uploading" || phase === "sealing" || phase === "signing" || phase === "ai";
  const done = phase === "done";

  // Giải phóng object URL khi rời trang.
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(() => () => Object.values(shotsRef.current).forEach((s) => URL.revokeObjectURL(s.previewUrl)), []);

  // Có ảnh mà chưa gửi: hỏi trước khi đóng tab hoặc tải lại.
  const dirty = Object.keys(shots).length > 0 && !done;
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
    sealed.current = null;
    if (phase === "error") {
      setFailedAt(null);
      go("idle");
    }
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

  async function submit() {
    setApiError("");
    setFailedAt(null);
    tx.reset();
    try {
      const token = await getAccessToken();

      // 1. Tải từng ảnh lên (lần lượt: mạng điện thoại trong phòng trọ thường yếu).
      if (!sealed.current) {
        go("uploading");
        let count = 0;
        setUploadedCount(0);
        for (const p of positions) {
          const s = shots[p.id];
          const cached = uploaded.current[p.id];
          if (!cached || cached.blob !== s.blob) {
            const up = await uploadPhoto(
              { blob: s.blob, purpose: kind, capturedAt: s.capturedAt, positionKey: p.id },
              token,
            );
            uploaded.current[p.id] = { blob: s.blob, photoId: up.photoId };
          }
          setUploadedCount(++count);
        }

        // 2. Server gom thành manifest và tính setHash.
        go("sealing");
        const set = await createPhotoSet(
          deal.dealId,
          { kind, items: positions.map((p) => ({ positionId: p.id, photoId: uploaded.current[p.id].photoId })) },
          token,
        );
        sealed.current = { setHash: set.setHash };
      }

      // 3. Ký hash lên contract. Lỗi ký/chuỗi hiện trong TxStatus.
      go("signing");
      const receipt = await tx.run({
        address: addresses.escrow,
        abi: escrowAbi,
        functionName: kind === "checkin" ? "submitCheckIn" : "submitCheckOut",
        args: [BigInt(deal.dealId), sealed.current.setHash],
      });
      if (!receipt) {
        fail();
        return;
      }

      // 4. Trả phòng: nhờ server chạy AI ngay khi giao dịch xác nhận. AI lỗi không chặn được gì:
      //    chủ trọ vẫn đề xuất được với chữ ký rỗng (nhánh H), và bấm "Xem báo cáo AI" sẽ thử lại.
      if (kind === "checkout") {
        go("ai");
        try {
          await startDamageAi(deal.dealId, token);
          setAiNote("AI đang so ảnh trước và sau. Kết quả hiện trong hợp đồng sau ít phút.");
        } catch {
          setAiNote("Chưa gọi được AI. Ảnh đã lên chuỗi an toàn; mở báo cáo AI trong hợp đồng để thử lại.");
        }
      }

      go("done");
      await qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] });
    } catch (e) {
      fail();
      if (e instanceof ApiClientError && e.code === "MISSING_POSITIONS") {
        setApiError("Máy chủ báo còn thiếu vị trí chưa chụp. Kiểm tra lại từng vị trí.");
      } else if (e instanceof ApiClientError && e.code === "WRONG_STATE") {
        setApiError("Hợp đồng đã sang bước khác. Quay lại hợp đồng để xem trạng thái mới.");
      } else {
        setApiError(e instanceof ApiClientError ? e.message : "Có lỗi khi gửi ảnh. Thử lại nhé.");
      }
    }
  }

  const reviewing = step >= n;
  const pos = positions[Math.min(step, n - 1)];
  const missing = positions.filter((p) => !shots[p.id]);
  const lateCheckIn = kind === "checkin" && passed;
  const taken = n - missing.length;
  const blockReason = lateCheckIn
    ? "Đã quá hạn gửi ảnh nhận phòng nên không gửi được nữa."
    : missing.length > 0
      ? `Còn ${missing.length} vị trí chưa chụp.`
      : "";

  const picker = busy || done ? undefined : setStep;

  return (
    <>
      <NetworkBanner />
      <PageShell>
        <PageHeader
          href={back}
          backLabel="Về hợp đồng"
          title={COPY[kind].title}
          right={
            <span className="text-sm text-muted-foreground tabular-nums">
              {reviewing ? "Kiểm tra" : `${step + 1}/${n}`}
            </span>
          }
        />
        <p className="text-sm text-muted-foreground">
          {deal.terms.room.title} · {n} vị trí cần chụp
        </p>

        <PositionStrip positions={positions} shots={shots} step={step} onPick={picker} />

        {kind === "checkin" && msLeft !== null && (
          <p
            className={cn(
              "mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm",
              passed ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-foreground/80",
            )}
          >
            <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden />
            {passed ? (
              "Đã quá hạn gửi ảnh nhận phòng."
            ) : (
              <span>
                Còn <b className="tabular-nums">{formatDuration(msLeft)}</b> để gửi ảnh. Quá hạn là được hoàn cọc, mất phí
                giữ chỗ.
              </span>
            )}
          </p>
        )}

        {reviewing ? (
          <PageColumns className="mt-4">
            <Review deal={deal} shots={shots} kind={kind} onPick={picker} sent={done} />
            <div>
              <ActionArea>
                <SubmitSteps
                  phase={phase}
                  failedAt={failedAt}
                  uploaded={uploadedCount}
                  total={n}
                  withAi={kind === "checkout"}
                  apiError={apiError}
                  aiNote={aiNote}
                />
                {tx.state.phase !== "idle" && <TxStatus state={tx.state} doneText={COPY[kind].done} />}
                {done ? (
                  <SuccessScreen
                    title={COPY[kind].done}
                    text={kind === "checkin" ? "Ảnh đã được khóa trên blockchain. Lúc trả phòng sẽ đối chiếu với bộ ảnh này." : "Ảnh đã được khóa trên blockchain. Chủ trọ sẽ xem và đề xuất mức trừ."}
                    href={back}
                  />
                ) : (
                  <>
                    {!busy && blockReason && (
                      <p id="submit-hint" className="text-sm text-muted-foreground">
                        {blockReason}
                      </p>
                    )}
                    <Button
                      size="lg"
                      className="w-full text-base"
                      disabled={busy || missing.length > 0 || lateCheckIn}
                      aria-describedby={!busy && blockReason ? "submit-hint" : undefined}
                      onClick={submit}
                    >
                      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Lock aria-hidden />}
                      {phase === "error" ? "Thử lại" : kind === "checkin" ? "Phòng đúng mô tả · Nhận phòng" : COPY[kind].submit}
                    </Button>
                    {kind === "checkin" && !busy && phase !== "error" && missing.length === 0 && !lateCheckIn && (
                      // Cùng bộ ảnh này: AI so với ảnh lúc đăng phòng. Bắt đầu so rồi thì không chụp lại được nữa.
                      <Button
                        size="lg"
                        variant="outline"
                        className="w-full text-base"
                        onClick={() => {
                          handOffShots(deal.dealId, shots);
                          router.push(back.replace(/(\/deals\/\d+)/, "$1/mismatch"));
                        }}
                      >
                        Phòng không giống mô tả
                      </Button>
                    )}
                  </>
                )}
              </ActionArea>
            </div>
          </PageColumns>
        ) : (
          <ShootStep
            key={pos.id}
            deal={deal}
            kind={kind}
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

// ------------------------------------------------------------------ một vị trí

/** Một vị trí: hướng dẫn + camera (hoặc ảnh vừa chụp để xem lại) + ảnh tham chiếu. */
export function ShootStep({
  deal,
  kind,
  pos,
  shot,
  onCapture,
  onRetake,
  onNext,
  isLast,
  taken,
}: {
  deal: DealView;
  kind: ShotKind;
  pos: Position;
  shot: Shot | null;
  onCapture: (c: CapturedPhoto) => void;
  onRetake: () => void;
  onNext: () => void;
  isLast: boolean;
  /** Số vị trí đã chụp, để nhắc tiến độ gần nút. Bỏ qua thì không hiện. */
  taken?: number;
}) {
  // Trả phòng: tham chiếu là ảnh nhận phòng cùng vị trí, để chụp đúng góc cũ cho AI so.
  // Nhận phòng và báo phòng sai: tham chiếu là ảnh ví dụ chủ trọ chụp lúc đăng phòng (GET /deals/:id > examplePhotoUrls).
  const refUrl =
    kind === "checkout"
      ? (deal.photoSets.checkin?.items.find((i) => i.positionId === pos.id)?.url ?? null)
      : (deal.examplePhotoUrls[pos.id] ?? null);
  const ref = REFERENCE[kind];
  const hasShot = !!shot;
  const total = deal.terms.positions.length;

  return (
    <section aria-labelledby="pos-name" className="@container mt-4">
      {/* Có ảnh vừa chụp: luôn hai cột để đặt cạnh ảnh tham chiếu mà so. Đang chụp: một cột, từ ~1024px hai cột. */}
      <div className={cn("grid gap-x-3 gap-y-4 @4xl:gap-x-8", hasShot ? "grid-cols-2" : "grid-cols-1 @4xl:grid-cols-2")}>
        <div className="col-span-full min-w-0 space-y-1">
          <h1 id="pos-name" className="text-2xl leading-tight font-extrabold tracking-tight text-balance text-primary">
            {pos.name}
          </h1>
          <p className="max-w-[70ch] text-foreground/80">{pos.instruction}</p>
        </div>

        <div className="min-w-0 space-y-2">
          <p className={cn("text-sm font-semibold text-foreground/80", !hasShot && "hidden @4xl:block")}>
            {hasShot ? (
              <>
                Ảnh bạn vừa chụp <span className="font-normal text-muted-foreground">· chưa gửi</span>
              </>
            ) : (
              "Chụp ở đây"
            )}
          </p>
          {shot ? (
            <figure className="space-y-1">
              <div className={cn(FRAME_CAP, "relative aspect-[3/4] overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/10")}>
                <RoomCover url={shot.previewUrl} alt={`Ảnh vừa chụp: ${pos.name}`} fit="contain" />
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-1 text-xs font-semibold text-white">
                  <Check className="size-3.5" aria-hidden /> Đã chụp
                </span>
              </div>
              <figcaption className="text-xs text-muted-foreground">
                Lúc{" "}
                {new Date(shot.capturedAt).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Ho_Chi_Minh",
                })}
                . Hiện đủ khung ảnh sẽ được gửi.
              </figcaption>
            </figure>
          ) : (
            <CameraCapture onCapture={onCapture} overlayUrl={kind === "checkout" ? refUrl : null} />
          )}
        </div>

        <figure className="min-w-0 space-y-2">
          <figcaption className="space-y-0.5">
            <span className="block text-sm font-semibold text-foreground/80">{ref.label}</span>
            <span className="block text-xs text-muted-foreground">{refUrl ? ref.note : ref.missing}</span>
          </figcaption>
          <div
            className={cn(
              FRAME_CAP,
              "overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/10",
              hasShot ? "aspect-[3/4]" : "aspect-[4/3] @4xl:aspect-[3/4]",
            )}
          >
            <RoomCover url={refUrl || null} alt={`${ref.label}: ${pos.name}`} label="Chưa có ảnh tham chiếu" fit="contain" />
          </div>
          {refUrl && (
            <a
              href={refUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-primary underline underline-offset-2"
            >
              Xem ảnh gốc<span className="sr-only">: {ref.label}, {pos.name} (mở tab mới)</span>
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </figure>

        {shot && (
          <div className="col-span-full flex flex-col gap-2 sm:flex-row @4xl:max-w-xl">
            <Button size="lg" variant="secondary" className="min-h-14 sm:w-40" onClick={onRetake}>
              <RefreshCw aria-hidden /> Chụp lại
            </Button>
            <Button size="lg" className="min-h-14 flex-1 text-base" onClick={onNext}>
              {isLast ? "Kiểm tra lại" : "Vị trí tiếp"} <ArrowRight aria-hidden />
            </Button>
          </div>
        )}
      </div>

      <p className="mt-4 max-w-[70ch] text-sm text-muted-foreground">
        Chụp rõ, đủ sáng, đúng góc. Ảnh mờ hoặc sai góc thì AI không kết luận được.
        {taken !== undefined && ` Đã chụp ${taken}/${total} vị trí.`}
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ kiểm tra lại

/** Lưới ảnh đã chụp để kiểm tra lần cuối trước khi khóa lên chuỗi. Chạm ảnh để quay lại vị trí đó. */
export function Review({
  deal,
  shots,
  kind,
  onPick,
  sent = false,
}: {
  deal: DealView;
  shots: Record<string, Shot>;
  kind: ShotKind;
  onPick?: (i: number) => void;
  /** Đã gửi và ký xong: ảnh không còn đổi được, nhãn chuyển từ "Chưa gửi" sang "Đã gửi". */
  sent?: boolean;
}) {
  const positions = deal.terms.positions;
  const missing = positions.filter((p) => !shots[p.id]).length;
  return (
    <section aria-labelledby="review" className="min-w-0 space-y-4">
      <h1 id="review" className="text-2xl font-extrabold tracking-tight text-primary">
        {sent ? `Đã gửi ${positions.length} ảnh` : `Kiểm tra lại ${positions.length} ảnh`}
      </h1>
      <ul className="grid grid-cols-2 gap-3 min-[420px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
        {positions.map((p, i) => {
          const s = shots[p.id];
          return (
            <li key={p.id} className="min-w-0 space-y-1">
              <button
                type="button"
                disabled={!onPick}
                onClick={() => onPick?.(i)}
                aria-label={s ? `${sent ? "Ảnh đã gửi" : "Xem lại"}: ${p.name}` : `Chưa chụp: ${p.name}. Chạm để chụp`}
                className={cn(
                  "grid aspect-[3/4] w-full place-items-center overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  !s && "ring-2 ring-destructive",
                )}
              >
                {s ? (
                  <RoomCover url={s.previewUrl} alt={`Ảnh đã chụp: ${p.name}`} fit="contain" />
                ) : (
                  <span className="px-2 text-center text-xs font-medium text-destructive">Chưa chụp</span>
                )}
              </button>
              <p className="text-sm leading-snug font-medium break-words">
                <span className="tabular-nums">{i + 1}.</span> {p.name}
              </p>
              <p className={cn("flex items-center gap-1 text-xs", !s ? "text-destructive" : sent ? "text-success" : "text-muted-foreground")}>
                {s ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                {!s ? "Chưa chụp" : sent ? "Đã gửi" : "Chưa gửi"}
              </p>
            </li>
          );
        })}
      </ul>
      {missing > 0 ? (
        <p className="text-sm text-destructive">Còn {missing} vị trí chưa chụp. Chạm vào ô đỏ để chụp.</p>
      ) : sent ? null : (
        <div className="flex items-start gap-3 rounded-2xl bg-secondary/60 p-4 text-sm">
          <Lock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p className="max-w-[70ch] text-foreground/80">
            {kind === "mismatch"
              ? "Gửi xong, bộ ảnh được khóa bằng một mã hash và AI so với ảnh chủ trọ đăng tin. Bước này chưa ký gì lên chuỗi: bạn xem kết quả AI rồi mới quyết định có báo hay không."
              : "Gửi xong, bộ ảnh được khóa bằng một mã hash ghi lên smart contract. Không ai sửa được, kể cả app."}
            {kind === "checkin"
              ? " Chủ trọ có một khoảng thời gian để xem; im lặng là đồng ý."
              : kind === "checkout"
                ? " AI sẽ so với ảnh nhận phòng để tính mức trừ."
                : ""}
          </p>
        </div>
      )}
    </section>
  );
}

/** Dải số theo vị trí: tích xanh = đã chụp, viền đậm = đang chụp. Chạm để nhảy tới vị trí. */
export function PositionStrip({
  positions,
  shots,
  step,
  onPick,
}: {
  positions: Position[];
  shots: Record<string, Shot>;
  step: number;
  onPick?: (i: number) => void;
}) {
  const taken = positions.filter((p) => shots[p.id]).length;
  return (
    <nav aria-label="Các vị trí chụp" className="mt-3">
      <ol className="flex gap-1.5">
        {positions.map((p, i) => {
          const has = !!shots[p.id];
          return (
            <li key={p.id} className="min-w-0 flex-1 sm:w-12 sm:flex-none">
              <button
                type="button"
                disabled={!onPick}
                onClick={() => onPick?.(i)}
                aria-label={`Vị trí ${i + 1}: ${p.name}${has ? " (đã chụp)" : " (chưa chụp)"}`}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-semibold tabular-nums ring-1 ring-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  has ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                  i === step && "bg-secondary text-primary ring-2 ring-primary",
                )}
              >
                {has ? <Check className="size-4" aria-hidden /> : i + 1}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-1.5 text-xs text-muted-foreground" aria-live="polite">
        Đã chụp {taken}/{positions.length} vị trí
      </p>
    </nav>
  );
}

// ------------------------------------------------------------------ tiến độ gửi

/** Tiến độ gửi theo từng bước: tải ảnh → khóa bộ ảnh → ký → (trả phòng) AI. Bước hỏng được đánh dấu riêng. */
function SubmitSteps({
  phase,
  failedAt,
  uploaded,
  total,
  withAi,
  apiError,
  aiNote,
}: {
  phase: Phase;
  failedAt: Phase | null;
  uploaded: number;
  total: number;
  withAi: boolean;
  apiError: string;
  aiNote: string;
}) {
  const steps: { key: Phase; label: string }[] = [
    { key: "uploading", label: `Tải ${total} ảnh lên` },
    { key: "sealing", label: "Khóa bộ ảnh (mã hash)" },
    { key: "signing", label: "Ký giao dịch trong ví" },
    ...(withAi ? [{ key: "ai" as Phase, label: "Nhờ AI so ảnh" }] : []),
  ];
  const idx = (p: Phase | null) => steps.findIndex((s) => s.key === p);
  const cur = phase === "done" ? steps.length : idx(phase);
  const failIdx = idx(failedAt);

  const statusOf = (i: number): "done" | "active" | "failed" | "pending" => {
    if (phase === "done") return "done";
    if (phase === "error") return i < failIdx ? "done" : i === failIdx ? "failed" : "pending";
    return i < cur ? "done" : i === cur ? "active" : "pending";
  };

  if (phase === "idle" && !apiError) return null;

  const live =
    phase === "uploading"
      ? `Đang tải ảnh lên, ${uploaded} trên ${total}`
      : phase === "sealing"
        ? "Đang khóa bộ ảnh"
        : phase === "signing"
          ? "Chờ ký giao dịch"
          : phase === "ai"
            ? "Đang gửi ảnh cho AI so sánh"
            : phase === "done"
              ? "Đã gửi xong"
              : "";

  return (
    <div className="space-y-2">
      <p className="sr-only" role="status" aria-live="polite">
        {live}
      </p>
      {apiError && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {apiError}
        </p>
      )}
      {phase !== "idle" && (
        <ol aria-label="Tiến độ gửi ảnh" className="space-y-1 rounded-xl bg-secondary/60 p-3 text-sm">
          {steps.map((s, i) => {
            const st = statusOf(i);
            return (
              <li key={s.key} className="space-y-1">
                <div
                  className={cn(
                    "flex items-center gap-2",
                    st === "pending" && "text-muted-foreground",
                    st === "failed" && "font-medium text-destructive",
                    st === "active" && "font-medium text-foreground",
                  )}
                  aria-current={st === "active" ? "step" : undefined}
                >
                  {st === "done" ? (
                    <Check className="size-4 shrink-0 text-success" aria-hidden />
                  ) : st === "active" ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-info" aria-hidden />
                  ) : st === "failed" ? (
                    <X className="size-4 shrink-0" aria-hidden />
                  ) : (
                    <Circle className="size-4 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0">
                    {s.label}
                    {s.key === "uploading" && st === "active" && (
                      <span className="tabular-nums"> ({uploaded}/{total})</span>
                    )}
                    {st === "failed" && " — chưa xong"}
                  </span>
                </div>
                {s.key === "uploading" && st === "active" && (
                  <div
                    role="progressbar"
                    aria-label="Đã tải lên"
                    aria-valuemin={0}
                    aria-valuemax={total}
                    aria-valuenow={uploaded}
                    className="ml-6 h-1.5 overflow-hidden rounded-full bg-muted"
                  >
                    <div className="h-full bg-primary transition-[width]" style={{ width: `${(uploaded / Math.max(total, 1)) * 100}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {aiNote && (
        <p className="flex items-start gap-2 rounded-xl bg-secondary/60 p-3 text-sm text-foreground/80">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {aiNote}
        </p>
      )}
    </div>
  );
}

/** Tiến độ phần API (tải ảnh, khóa bộ ảnh, gọi AI) dạng một dòng. Màn "Báo phòng không đúng" dùng; phần giao dịch do TxStatus hiện. */
export function SubmitProgress({
  phase,
  uploaded,
  total,
  apiError,
  aiNote,
}: {
  phase: string;
  uploaded: number;
  total: number;
  apiError: string;
  aiNote: string;
}) {
  let text = "";
  if (phase === "uploading") text = `Đang tải ảnh lên (${uploaded}/${total})…`;
  else if (phase === "sealing") text = "Đang khóa bộ ảnh…";
  else if (phase === "ai") text = "Đang gửi ảnh cho AI so sánh…";

  if (apiError) {
    return (
      <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
        {apiError}
      </p>
    );
  }
  if (text) {
    return (
      <p role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl bg-info/10 p-3 text-sm text-info">
        <Loader2 className="size-4 animate-spin" aria-hidden /> {text}
      </p>
    );
  }
  if (aiNote) {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-secondary/60 p-3 text-sm text-foreground/80">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {aiNote}
      </p>
    );
  }
  return null;
}
