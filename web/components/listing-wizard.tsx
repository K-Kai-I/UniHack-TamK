"use client";
// Màn "Đăng phòng + hợp đồng" nhiều bước (docs/user-flow.md GĐ1, P0).
// Luồng bấm "Đăng phòng": POST /uploads từng ảnh → POST /listings (nhận createDealArgs + termsHash)
// → ví ký createDeal → POST /listings/:id/onchain. Frontend không tự tính hash hay đổi ngày sang giây.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { TxStatus } from "@/components/tx-status";
import {
  DatesStep,
  InfoStep,
  MoneyStep,
  PositionsStep,
  PricesStep,
  ReviewStep,
  type StepProps,
} from "@/components/listing-steps";
import { ApiClientError } from "@/lib/client/api";
import {
  buildListingBody,
  emptyDraft,
  firstInvalidStep,
  STEPS,
  validateStep,
  type Errors,
  type ListingDraft,
} from "@/lib/client/listing-form";
import { confirmOnchain, createListing, uploadPhoto, type CreateListingResponse } from "@/lib/client/listings-api";
import { useCreateDeal } from "@/lib/client/use-create-deal";
import { useVndRate } from "@/lib/client/use-vnd-rate";

type Phase =
  | { name: "editing" }
  | { name: "uploading"; done: number; total: number }
  | { name: "terms" }
  | { name: "signing" } // TxStatus hiện chi tiết chờ ký / chờ xác nhận / lỗi
  | { name: "confirming" }
  | { name: "done"; dealId: number };

export function ListingWizard() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const vndPerToken = useVndRate();
  const deal = useCreateDeal();

  const [draft, setDraft] = useState<ListingDraft>(emptyDraft);
  const [stepIdx, setStepIdx] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [phase, setPhase] = useState<Phase>({ name: "editing" });
  const [failure, setFailure] = useState<string | null>(null);
  // Giữ kết quả POST /listings: ký lại createDeal (người dùng từ chối ví...) không phải tải ảnh lên lần nữa.
  const listingRef = useRef<CreateListingResponse | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const step = STEPS[stepIdx];
  const busy = phase.name !== "editing";

  // Giải phóng object URL khi rời trang.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(
    () => () => {
      const d = draftRef.current;
      d.photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      d.positions.forEach((p) => p.photo && URL.revokeObjectURL(p.photo.previewUrl));
    },
    [],
  );

  const set = useCallback((patch: Partial<ListingDraft>) => {
    listingRef.current = null; // đã sửa nội dung → điều khoản cũ không còn đúng
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
  }, []);

  const scrollTop = () => topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });

  function go(i: number) {
    setStepIdx(i);
    setErrors({});
    scrollTop();
  }

  function next() {
    const e = validateStep(step.id, draft);
    if (Object.keys(e).length) {
      setErrors(e);
      toast.error("Còn chỗ chưa điền đúng. Xem các dòng màu đỏ.");
      return;
    }
    go(stepIdx + 1);
  }

  async function publish() {
    const bad = firstInvalidStep(draft);
    if (bad) {
      toast.error("Còn bước chưa điền đủ.");
      go(STEPS.findIndex((s) => s.id === bad));
      setErrors(validateStep(bad, draft));
      return;
    }
    setFailure(null);
    try {
      const token = await getAccessToken();
      let listing = listingRef.current;

      if (!listing) {
        // 1) Tải ảnh lên. Mọi ảnh trước, rồi mới tạo điều khoản.
        const jobs: { kind: "listing" | "example"; key?: string; photo: ListingDraft["photos"][number] }[] = [
          ...draft.photos.map((photo) => ({ kind: "listing" as const, photo })),
          ...draft.positions.map((p) => ({ kind: "example" as const, key: p.key, photo: p.photo! })),
        ];
        const listingIds: string[] = [];
        const exampleIds: Record<string, string> = {};
        for (let i = 0; i < jobs.length; i++) {
          setPhase({ name: "uploading", done: i, total: jobs.length });
          const j = jobs[i];
          const up = await uploadPhoto(
            { blob: j.photo.blob, purpose: j.kind, capturedAt: j.photo.capturedAt, positionKey: j.key },
            token,
          );
          if (j.kind === "listing") listingIds.push(up.photoId);
          else exampleIds[j.key!] = up.photoId;
        }

        // 2) Tạo điều khoản, nhận termsHash + createDealArgs từ API.
        setPhase({ name: "terms" });
        listing = await createListing(
          buildListingBody(draft, vndPerToken, { listing: listingIds, example: exampleIds }),
          token,
        );
        listingRef.current = listing;
      }

      // 3) Ví ký createDeal. Dùng nguyên createDealArgs.
      setPhase({ name: "signing" });
      const res = await deal.createDeal(listing.createDealArgs);
      if (!res) {
        // Lỗi (hoặc từ chối ký) đã hiện trong TxStatus. Về lại màn xem lại để thử ký tiếp.
        setPhase({ name: "editing" });
        return;
      }

      // 4) Báo API gắn dealId. Giao dịch đã lên chuỗi nên lỗi ở đây không làm mất phòng.
      setPhase({ name: "confirming" });
      try {
        await confirmOnchain(listing.listingId, { dealId: Number(res.dealId), txHash: res.txHash }, token);
      } catch (e) {
        toast.warning(
          "Phòng đã lên chuỗi nhưng chưa báo được cho máy chủ. Phòng có thể chưa hiện trong danh sách ngay.",
        );
        console.error(e);
      }
      setPhase({ name: "done", dealId: Number(res.dealId) });
      scrollTop();
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.message : "Có lỗi không rõ. Thử lại sau.";
      setFailure(msg);
      setPhase({ name: "editing" });
    }
  }

  // ------------------------------------------------------------------------------------------- render

  if (phase.name === "done") return <Done dealId={phase.dealId} hash={deal.state.hash} />;

  if (ready && !authenticated) {
    return (
      <main className="mx-auto min-h-dvh max-w-md px-5">
        <PageHeader href="/" backLabel="Về trang chủ" title="Đăng phòng" />
        <div className="mt-8 grid place-items-center gap-3 rounded-2xl bg-muted px-6 py-12 text-center">
          <p className="font-semibold">Đăng nhập để đăng phòng</p>
          <p className="text-sm text-muted-foreground">Ví của bạn sẽ là ví chủ trọ và ký giao dịch đăng phòng.</p>
          <Button size="lg" onClick={login}>
            Đăng nhập
          </Button>
        </div>
      </main>
    );
  }

  const props: StepProps = { draft, set, errors, vndPerToken };
  const last = stepIdx === STEPS.length - 1;

  return (
    <>
      <NetworkBanner />
      <main className="mx-auto min-h-dvh max-w-md px-5 pb-36">
        <div ref={topRef} className="scroll-mt-2" />
        <PageHeader
          href="/"
          backLabel="Về trang chủ"
          title="Đăng phòng"
          right={<span className="text-sm text-muted-foreground">{stepIdx + 1}/{STEPS.length}</span>}
        />

        <nav aria-label="Các bước" className="mt-3">
          <ol className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <li key={s.id} className="h-1.5 flex-1 rounded-full bg-secondary" aria-current={i === stepIdx ? "step" : undefined}>
                <div className={"h-full rounded-full bg-primary transition-all " + (i <= stepIdx ? "w-full" : "w-0")} />
              </li>
            ))}
          </ol>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-primary">{step.label}</h1>
        </nav>

        <fieldset disabled={busy} className="mt-6 min-w-0">
          {step.id === "info" && <InfoStep {...props} />}
          {step.id === "money" && <MoneyStep {...props} />}
          {step.id === "dates" && <DatesStep {...props} />}
          {step.id === "positions" && <PositionsStep {...props} />}
          {step.id === "prices" && <PricesStep {...props} />}
          {step.id === "review" && (
            <ReviewStep
              {...props}
              goto={(id) => go(STEPS.findIndex((s) => s.id === id))}
            />
          )}
        </fieldset>

        <div className="mt-6 space-y-3">
          {failure && (
            <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {failure}
            </p>
          )}
          {phase.name === "uploading" && <Progress text={`Đang tải ảnh ${phase.done + 1}/${phase.total}…`} />}
          {phase.name === "terms" && <Progress text="Đang dựng điều khoản…" />}
          {phase.name === "confirming" && <Progress text="Đang ghi nhận phòng…" />}
          {(phase.name === "signing" || deal.state.phase !== "idle") && (
            <TxStatus state={deal.state} doneText="Đã đăng phòng lên chuỗi" />
          )}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-md gap-3 px-5 pt-3">
          {stepIdx > 0 && (
            <Button size="lg" variant="outline" className="h-14 px-6 text-base" disabled={busy} onClick={() => go(stepIdx - 1)}>
              Quay lại
            </Button>
          )}
          {last ? (
            <Button size="lg" className="h-14 flex-1 text-base" disabled={busy || !ready} onClick={publish}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {deal.state.phase === "error" || failure ? "Thử đăng lại" : "Đăng phòng"}
            </Button>
          ) : (
            <Button size="lg" className="h-14 flex-1 text-base" disabled={busy} onClick={next}>
              Tiếp tục
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function Progress({ text }: { text: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl bg-info/10 p-3 text-sm text-info">
      <Loader2 className="size-5 animate-spin" /> <span className="font-semibold">{text}</span>
    </div>
  );
}

function Done({ dealId, hash }: { dealId: number; hash?: `0x${string}` }) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-5">
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto size-14 text-success" />
        <h1 className="text-2xl font-extrabold text-primary">Đã đăng phòng</h1>
        <p className="text-muted-foreground">
          Phòng #{dealId} đang ở trạng thái <b>Đang trống</b>. Ai gửi cọc trước sẽ thuê phòng.
        </p>
        {hash && <TxStatus state={{ phase: "success", hash }} doneText="Giao dịch đăng phòng" />}
        <div className="grid gap-2 pt-2">
          <Button asChild size="lg" className="h-14 text-base">
            <Link href={`/rooms/${dealId}`}>Xem phòng của tôi</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-14 text-base">
            <Link href="/">Về trang chủ</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
