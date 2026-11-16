"use client";
// Màn "Camera chụp theo vị trí" (docs/user-flow.md GĐ3 và GĐ5, P0). Chụp lần lượt từng vị trí trong điều khoản,
// mỗi vị trí có hướng dẫn góc chụp và ảnh tham chiếu, rồi gửi cả bộ:
//   POST /uploads từng ảnh → POST /deals/:id/photo-sets (setHash) → ký submitCheckIn / submitCheckOut
//   → trả phòng thì gọi thêm POST /deals/:id/ai/damage.
// Lớp ảnh cũ mờ đè lên khung là P2: bản này chỉ hiện ảnh cũ nhỏ bên cạnh. GPS (P2) chưa gửi.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Hourglass, Loader2, Lock, RefreshCw, SearchX, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CameraCapture, type CapturedPhoto } from "@/components/camera-capture";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { RoomCover } from "@/components/room-cover";
import { TxStatus } from "@/components/tx-status";
import { addresses, escrowAbi } from "@/lib/chain";
import { ApiClientError } from "@/lib/client/api";
import { actionsFor, roleOf, type ActionId, type Role } from "@/lib/client/deal-actions";
import { DEALS_MOCK, fetchDealView, NotFoundError, type DealView } from "@/lib/client/deals-data";
import { uploadPhoto } from "@/lib/client/listings-api";
import { createPhotoSet, startDamageAi } from "@/lib/client/photo-sets-api";
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

export interface Shot {
  blob: Blob;
  capturedAt: string;
  previewUrl: string;
}

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
      <main className="mx-auto min-h-dvh max-w-md space-y-4 px-5">
        <PageHeader href={back} backLabel="Về hợp đồng" title={COPY[kind].title} />
        <Skeleton className="h-8 w-3/5" />
        <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
      </main>
    );
  }

  // Chỉ mở camera khi contract đang chờ đúng bước này từ đúng người (bảng "Nút trên app theo trạng thái").
  const role: Role = DEALS_MOCK && previewAs ? previewAs : roleOf(data, address);
  const need: ActionId[] = kind === "checkin" ? ["checkin"] : ["checkout", "checkoutForTenant"];
  const allowed = actionsFor(data, role, now).some((a) => need.includes(a.id));
  if (!allowed) {
    return (
      <Blocked
        back={back}
        title="Chưa tới bước chụp ảnh này"
        text={
          kind === "checkin"
            ? "Chỉ người thuê chụp ảnh nhận phòng, sau khi đã gửi cọc và trước khi gửi ảnh."
            : "Người thuê trả phòng khi đang ở. Chủ trọ chỉ trả phòng thay sau khi hết hạn thuê."
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
  const router = useRouter();
  const qc = useQueryClient();
  const { getAccessToken } = usePrivy();
  const tx = useTx();

  const [shots, setShots] = useState<Record<string, Shot>>({});
  const [step, setStep] = useState(0); // 0..n-1 = vị trí đang chụp, n = màn kiểm tra lại
  const [phase, setPhase] = useState<"idle" | "uploading" | "sealing" | "signing" | "ai" | "done" | "error">("idle");
  const [uploadedCount, setUploadedCount] = useState(0);
  const [apiError, setApiError] = useState("");
  const [aiNote, setAiNote] = useState("");

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

  async function submit() {
    setApiError("");
    tx.reset();
    try {
      const token = await getAccessToken();

      // 1. Tải từng ảnh lên (lần lượt: mạng điện thoại trong phòng trọ thường yếu).
      if (!sealed.current) {
        setPhase("uploading");
        let count = 0;
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
        setPhase("sealing");
        const set = await createPhotoSet(
          deal.dealId,
          { kind, items: positions.map((p) => ({ positionId: p.id, photoId: uploaded.current[p.id].photoId })) },
          token,
        );
        sealed.current = { setHash: set.setHash };
      }

      // 3. Ký hash lên contract. Lỗi ký/chuỗi hiện trong TxStatus.
      setPhase("signing");
      const receipt = await tx.run({
        address: addresses.escrow,
        abi: escrowAbi,
        functionName: kind === "checkin" ? "submitCheckIn" : "submitCheckOut",
        args: [BigInt(deal.dealId), sealed.current.setHash],
      });
      if (!receipt) {
        setPhase("error");
        return;
      }

      // 4. Trả phòng: nhờ server chạy AI ngay khi giao dịch xác nhận. AI lỗi không chặn được gì:
      //    chủ trọ vẫn đề xuất được với chữ ký rỗng (nhánh H), và bấm "Xem báo cáo AI" sẽ thử lại.
      if (kind === "checkout") {
        setPhase("ai");
        try {
          await startDamageAi(deal.dealId, token);
          setAiNote("AI đang so ảnh trước và sau. Kết quả hiện trong hợp đồng sau ít phút.");
        } catch {
          setAiNote("Chưa gọi được AI. Ảnh đã lên chuỗi an toàn; mở báo cáo AI trong hợp đồng để thử lại.");
        }
      }

      setPhase("done");
      await qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] });
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

  const reviewing = step >= n;
  const pos = positions[Math.min(step, n - 1)];
  const missing = positions.filter((p) => !shots[p.id]);
  const lateCheckIn = kind === "checkin" && passed;

  return (
    <>
      <NetworkBanner />
      <main className="mx-auto min-h-dvh max-w-md px-5 pb-44">
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

        <PositionStrip positions={positions} shots={shots} step={step} onPick={busy || done ? undefined : setStep} />

        {kind === "checkin" && msLeft !== null && (
          <p
            className={cn(
              "mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
              passed ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-foreground/80",
            )}
          >
            <Hourglass className="size-4 shrink-0" />
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
          <Review
            deal={deal}
            shots={shots}
            kind={kind}
            onPick={busy || done ? undefined : setStep}
          />
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
          />
        )}
      </main>

      {reviewing && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto max-w-md space-y-2 px-5 pt-3">
            <SubmitProgress phase={phase} uploaded={uploadedCount} total={n} apiError={apiError} aiNote={aiNote} />
            {tx.state.phase !== "idle" && <TxStatus state={tx.state} doneText={COPY[kind].done} />}
            {done ? (
              <Button size="lg" className="h-14 w-full text-base" onClick={() => router.push(back)}>
                Về hợp đồng
              </Button>
            ) : (
              <Button
                size="lg"
                className="h-14 w-full text-base"
                disabled={busy || missing.length > 0 || lateCheckIn}
                onClick={submit}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Lock />}
                {phase === "error" ? "Thử lại" : COPY[kind].submit}
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Một vị trí: hướng dẫn + ảnh tham chiếu + camera (hoặc ảnh vừa chụp để xem lại). */
export function ShootStep({
  deal,
  kind,
  pos,
  shot,
  onCapture,
  onRetake,
  onNext,
  isLast,
}: {
  deal: DealView;
  kind: ShotKind;
  pos: Position;
  shot: Shot | null;
  onCapture: (c: CapturedPhoto) => void;
  onRetake: () => void;
  onNext: () => void;
  isLast: boolean;
}) {
  // Trả phòng: tham chiếu là ảnh nhận phòng cùng vị trí, để chụp đúng góc cũ cho AI so.
  // Nhận phòng và báo phòng sai: tham chiếu là ảnh ví dụ chủ trọ chụp lúc đăng phòng (GET /deals/:id > examplePhotoUrls).
  const refUrl =
    kind === "checkout"
      ? (deal.photoSets.checkin?.items.find((i) => i.positionId === pos.id)?.url ?? null)
      : (deal.examplePhotoUrls[pos.id] ?? null);
  const refLabel = kind === "checkout" ? "Lúc nhận phòng" : kind === "mismatch" ? "Lúc đăng tin" : "Ảnh ví dụ";

  return (
    <section aria-labelledby="pos-name" className="mt-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 id="pos-name" className="text-2xl leading-tight font-extrabold tracking-tight text-balance text-primary">
            {pos.name}
          </h1>
          <p className="text-foreground/80">{pos.instruction}</p>
        </div>
        <figure className="w-20 shrink-0 space-y-1">
          <div className="aspect-[3/4] overflow-hidden rounded-lg ring-1 ring-foreground/10">
            <RoomCover url={refUrl || null} alt={`${refLabel}: ${pos.name}`} label="" />
          </div>
          <figcaption className="text-center text-[11px] leading-tight text-muted-foreground">{refLabel}</figcaption>
        </figure>
      </div>

      {shot ? (
        <div className="space-y-3">
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.previewUrl} alt={`Ảnh vừa chụp: ${pos.name}`} className="size-full object-cover" />
            <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-1 text-xs font-semibold text-white">
              <Check className="size-3.5" /> Đã chụp
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="lg" variant="secondary" className="h-14" onClick={onRetake}>
              <RefreshCw /> Chụp lại
            </Button>
            <Button size="lg" className="h-14 flex-1 text-base" onClick={onNext}>
              {isLast ? "Kiểm tra lại" : "Vị trí tiếp"} <ArrowRight />
            </Button>
          </div>
        </div>
      ) : (
        <CameraCapture onCapture={onCapture} />
      )}

      <p className="text-sm text-muted-foreground">
        Chụp rõ, đủ sáng, đúng góc. Ảnh mờ hoặc sai góc thì AI không kết luận được.
      </p>
    </section>
  );
}

/** Lưới ảnh đã chụp để kiểm tra lần cuối trước khi khóa lên chuỗi. Chạm ảnh để quay lại vị trí đó. */
export function Review({
  deal,
  shots,
  kind,
  onPick,
}: {
  deal: DealView;
  shots: Record<string, Shot>;
  kind: ShotKind;
  onPick?: (i: number) => void;
}) {
  const positions = deal.terms.positions;
  const missing = positions.filter((p) => !shots[p.id]).length;
  return (
    <section aria-labelledby="review" className="mt-4 space-y-4">
      <h1 id="review" className="text-2xl font-extrabold tracking-tight text-primary">
        Kiểm tra lại {positions.length} ảnh
      </h1>
      <ul className="grid grid-cols-3 gap-2">
        {positions.map((p, i) => {
          const s = shots[p.id];
          return (
            <li key={p.id} className="space-y-1">
              <button
                type="button"
                disabled={!onPick}
                onClick={() => onPick?.(i)}
                aria-label={s ? `Xem lại: ${p.name}` : `Chưa chụp: ${p.name}`}
                className={cn(
                  "grid aspect-[3/4] w-full place-items-center overflow-hidden rounded-xl bg-secondary ring-1 ring-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  !s && "ring-2 ring-destructive",
                )}
              >
                {s ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.previewUrl} alt="" className="size-full object-cover" />
                ) : (
                  <span className="px-2 text-center text-xs font-medium text-destructive">Chưa chụp</span>
                )}
              </button>
              <p className="truncate text-xs text-muted-foreground">{p.name}</p>
            </li>
          );
        })}
      </ul>
      {missing > 0 ? (
        <p className="text-sm text-destructive">Còn {missing} vị trí chưa chụp. Chạm vào ô đỏ để chụp.</p>
      ) : (
        <div className="flex items-start gap-3 rounded-2xl bg-secondary/60 p-4 text-sm">
          <Lock className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-foreground/80">
            Gửi xong, bộ ảnh được khóa bằng một mã hash ghi lên smart contract. Không ai sửa được, kể cả app.
            {kind === "checkin"
              ? " Chủ trọ có một khoảng thời gian để xem; im lặng là đồng ý."
              : kind === "mismatch"
                ? " AI sẽ so với ảnh chủ trọ đăng tin."
                : " AI sẽ so với ảnh nhận phòng để tính mức trừ."}
          </p>
        </div>
      )}
    </section>
  );
}

/** Dải chấm theo vị trí: xanh = đã chụp, viền = đang chụp. Chạm để nhảy tới vị trí. */
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
  return (
    <nav aria-label="Các vị trí chụp" className="mt-2">
      <ol className="flex gap-1.5">
        {positions.map((p, i) => (
          <li key={p.id} className="flex-1">
            <button
              type="button"
              disabled={!onPick}
              onClick={() => onPick?.(i)}
              aria-label={`${p.name}${shots[p.id] ? " (đã chụp)" : ""}`}
              aria-current={i === step ? "step" : undefined}
              className="block w-full py-2"
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full",
                  shots[p.id] ? "bg-success" : "bg-muted",
                  i === step && "ring-2 ring-primary ring-offset-1",
                )}
              />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Tiến độ phần API (tải ảnh, khóa bộ ảnh, gọi AI). Phần giao dịch do TxStatus hiện. */
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
        <Loader2 className="size-4 animate-spin" /> {text}
      </p>
    );
  }
  if (aiNote) {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-secondary/60 p-3 text-sm text-foreground/80">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" /> {aiNote}
      </p>
    );
  }
  return null;
}

function Blocked({
  back,
  title,
  text,
  children,
}: {
  back: string;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-5">
      <PageHeader href={back} backLabel="Về hợp đồng" />
      <div className="mt-8 grid place-items-center gap-3 rounded-2xl bg-muted px-6 py-12 text-center">
        <SearchX className="size-8 text-muted-foreground" />
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
        {children ?? (
          <Button asChild>
            <Link href={back}>Về hợp đồng</Link>
          </Button>
        )}
      </div>
    </main>
  );
}
