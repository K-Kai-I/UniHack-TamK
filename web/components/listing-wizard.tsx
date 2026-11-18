"use client";
// Màn "Đăng phòng + hợp đồng" nhiều bước (docs/user-flow.md GĐ1, P0).
// Luồng bấm "Đăng phòng": POST /uploads từng ảnh → POST /listings (nhận createDealArgs + termsHash)
// → ví ký createDeal → POST /listings/:id/onchain. Frontend không tự tính hash hay đổi ngày sang giây.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { Check, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ActionArea } from "@/components/action-area";
import { PageShell } from "@/components/page-shell";
import { formatDate } from "@/lib/client/date";
import { formatVnd, parseVndInput } from "@/lib/client/money";
import type { TxState } from "@/lib/client/use-tx";
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
  dateToIso,
  firstInvalidStep,
  STEPS,
  validateStep,
  type Errors,
  type ListingDraft,
} from "@/lib/client/listing-form";
import { confirmOnchain, createListing, uploadPhoto, type CreateListingResponse } from "@/lib/client/listings-api";
import { isUnresolved, sentHashOf, signOrResume, useCreateDeal } from "@/lib/client/use-create-deal";
import { useVndRate } from "@/lib/client/use-vnd-rate";

export type ListingPhase =
  | { name: "editing" }
  | { name: "preparing" }
  | { name: "uploading"; done: number; total: number }
  | { name: "terms" }
  | { name: "signing" } // TxStatus hiện chi tiết chờ ký / chờ xác nhận / lỗi
  | { name: "checking" } // chờ lại giao dịch đã gửi, KHÔNG ký mới
  | { name: "confirming" }
  | { name: "done"; dealId: number };

export const UNRESOLVED_TX = "Giao dịch đăng phòng đã được gửi nhưng chưa biết kết quả. Đừng ký lại. Bấm “Kiểm tra giao dịch” để xem lại.";

export function ListingWizard() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const vndPerToken = useVndRate();
  const deal = useCreateDeal();

  const listingRef = useRef<CreateListingResponse | null>(null);

  async function publish(draft: ListingDraft, setPhase: (phase: ListingPhase) => void) {
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

      // 3) Ví ký createDeal, dùng nguyên createDealArgs. Nếu lần trước ĐÃ gửi giao dịch mà chưa biết kết quả thì
      //    không ký lại, chỉ chờ lại giao dịch cũ (signOrResume): ký lần hai sẽ tạo deal thứ hai cho cùng một tin.
      const res = await signOrResume(deal.state, deal, listing.createDealArgs,
        kind => setPhase({ name: kind === "check" ? "checking" : "signing" }));
      if (!res.ok) {
        if (isUnresolved(res)) throw new Error(UNRESOLVED_TX);
        // Từ chối ký hoặc chuỗi báo revert: chưa có gì lên chuỗi, lỗi đã hiện trong TxStatus, ký lại được.
        return null;
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
      return Number(res.dealId);
    } catch (e) {
      const msg = e instanceof ApiClientError || (e instanceof Error && e.message === UNRESOLVED_TX)
        ? e.message : "Có lỗi không rõ. Thử lại sau.";
      throw new Error(msg);
    }
  }

  return <><NetworkBanner /><ListingWizardView ready={ready} authenticated={authenticated} onLogin={login}
    vndPerToken={vndPerToken} transaction={deal.state} onPublish={publish}
    onDraftChange={() => { listingRef.current = null; deal.reset(); }} /></>;
}

const HELP = {
  info: "Ảnh và thông tin giúp người thuê nhận ra đúng căn phòng.",
  money: "Tiền cọc và điều kiện phí giữ chỗ sẽ đi cùng hợp đồng.",
  dates: "Chọn mốc nhận phòng và ngày hết hạn thuê.",
  positions: "Cùng vị trí, cùng góc chụp ở mốc nhận và trả phòng.",
  prices: "Thống nhất đơn giá sửa chữa trước khi người thuê gửi cọc.",
  review: "Kiểm tra ảnh, tiền và điều khoản trước khi ký đăng phòng.",
};

/** Cùng form cho route thật và preview; preview chỉ thay callback gửi, không gọi ví/API. */
export function ListingWizardView({
  ready, authenticated, onLogin, vndPerToken, transaction, onPublish, onDraftChange,
  initialDraft = emptyDraft, initialStep = 0,
}: {
  ready: boolean;
  authenticated: boolean;
  onLogin: () => void;
  vndPerToken: number;
  transaction: TxState;
  onPublish: (draft: ListingDraft, progress: (phase: ListingPhase) => void) => Promise<number | null>;
  onDraftChange?: () => void;
  initialDraft?: () => ListingDraft;
  initialStep?: number;
}) {
  const [draft, setDraft] = useState<ListingDraft>(initialDraft);
  const [stepIdx, setStepIdx] = useState(initialStep);
  const [maxReached, setMaxReached] = useState(initialStep); // bước xa nhất đã tới: thanh bước cho nhảy lại tới đó
  const [returnTo, setReturnTo] = useState<number | null>(null); // đang sửa từ Xem lại: nút chính đưa về đó
  const [errors, setErrors] = useState<Errors>({});
  const [phase, setPhase] = useState<ListingPhase>({ name: "editing" });
  const [failure, setFailure] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fieldsRef = useRef<HTMLFieldSetElement>(null);
  const actionLock = useRef(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const refocusAction = useRef(false);
  const step = STEPS[stepIdx];
  const busy = phase.name !== "editing";
  const reviewIdx = STEPS.length - 1;
  const last = stepIdx === reviewIdx;
  // Đã có hash mà chưa biết kết quả: nút đăng đổi thành "Kiểm tra giao dịch", không ký lại.
  const unresolved = sentHashOf(transaction) !== undefined;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // Nút và form bị khóa lúc đăng nên focus rơi về body; xong (lỗi/hủy ký) thì trả focus về nút hành động.
  useEffect(() => {
    if (phase.name !== "editing" || !refocusAction.current) return;
    refocusAction.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) primaryRef.current?.focus({ preventScroll: true });
  }, [phase.name]);
  useEffect(() => () => {
    const d = draftRef.current;
    d.photos.forEach(p => URL.revokeObjectURL(p.previewUrl));
    d.positions.forEach(p => p.photo && URL.revokeObjectURL(p.photo.previewUrl));
  }, []);

  const set = useCallback((patch: Partial<ListingDraft>) => {
    // Điều khoản đã gửi phải giữ nguyên tới khi biết kết quả; reset hash ở đây có thể tạo hai phòng.
    if (unresolved) return;
    onDraftChange?.();
    const currentDraft = draftRef.current;
    setDraft(d => ({ ...d, ...patch }));
    // Giữ các lỗi khác tới khi người dùng kiểm tra lại, tránh mất dấu trường còn sai.
    setErrors(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => {
      const root = key.split(".")[0];
      if (root === "positions" && patch.positions && key.includes(".")) {
        return currentDraft.positions.find(p => p.key === key.slice(10)) === patch.positions.find(p => p.key === key.slice(10));
      }
      if (root === "prices" && patch.prices && key.includes(".")) {
        return currentDraft.prices.find(p => p.key === key.slice(7)) === patch.prices.find(p => p.key === key.slice(7));
      }
      return !(root in patch);
    })));
    setFailure(null);
  }, [onDraftChange, unresolved]);

  function focusHeading() {
    requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
      headingRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }
  function go(i: number) {
    setStepIdx(i); setMaxReached(m => Math.max(m, i)); setErrors({}); focusHeading();
    if (i === reviewIdx) setReturnTo(null);
  }
  /** Tới bước `target` phía trước: kiểm tra từng bước từ bước hiện tại, bước nào còn lỗi thì dừng ở đó. */
  function advance(target: number) {
    for (let k = stepIdx; k < target; k++) {
      const e = validateStep(STEPS[k].id, draft);
      if (Object.keys(e).length) { showErrors(e, k); return; }
    }
    go(target);
  }
  function edit(id: string) {
    go(STEPS.findIndex(s => s.id === id));
    setReturnTo(reviewIdx);
  }
  function showErrors(e: Errors, index = stepIdx) {
    setStepIdx(index); setErrors(e);
    requestAnimationFrame(() => {
      const target = fieldsRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]:not(:disabled), [data-field-invalid], [data-field-error]');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "center", behavior: "instant" });
    });
  }
  async function publish() {
    if (actionLock.current) return;
    const bad = firstInvalidStep(draft);
    if (bad) { showErrors(validateStep(bad, draft), STEPS.findIndex(s => s.id === bad)); return; }
    actionLock.current = true;
    refocusAction.current = true;
    setFailure(null);
    setPhase({ name: "preparing" });
    try {
      const id = await onPublish(draft, setPhase);
      setPhase(id === null ? { name: "editing" } : { name: "done", dealId: id });
      if (id !== null) window.scrollTo({ top: 0, behavior: "instant" });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Chưa đăng được phòng. Thử lại sau.");
      setPhase({ name: "editing" });
    } finally { actionLock.current = false; }
  }

  if (phase.name === "done") return <Done dealId={phase.dealId} hash={transaction.hash} />;
  if (ready && !authenticated) return <PageShell size="read">
    <PageHeader href="/" backLabel="Về trang chủ" title="Đăng phòng" />
    <section className="my-8 max-w-xl space-y-4 rounded-2xl bg-secondary p-6">
      <h1 className="text-2xl font-bold text-primary">Đăng nhập để đăng phòng</h1>
      <p className="text-muted-foreground">Bạn sẽ xác nhận điều khoản và ký đăng phòng bằng tài khoản của mình.</p>
      <Button size="lg" onClick={onLogin}>Đăng nhập</Button>
    </section>
  </PageShell>;

  const props: StepProps = { draft, set, errors, vndPerToken };
  const hasErrors = Object.keys(errors).length > 0;
  return <PageShell>
    <PageHeader href="/" backLabel="Về trang chủ" title="Đăng phòng" right={<span className="text-sm text-muted-foreground">Bước {stepIdx + 1}/{STEPS.length}</span>} />
    <div className="mx-auto mt-4 max-w-[40rem] lg:mx-0 lg:max-w-[62rem]">
      <nav aria-label="Các bước đăng phòng">
        <ol className="grid grid-cols-3 gap-x-3 gap-y-1 sm:grid-cols-6">
          {STEPS.map((s, i) => <li key={s.id} aria-current={i === stepIdx ? "step" : undefined}>
            <button type="button" disabled={busy || !ready || i === stepIdx || i > maxReached} onClick={() => i < stepIdx ? go(i) : advance(i)}
              className={"flex min-h-11 w-full flex-col gap-2 rounded-sm py-2 text-left text-xs sm:text-sm " + (i === stepIdx ? "font-semibold text-primary" : "text-muted-foreground") }>
              <span className={"h-1.5 w-full rounded-full " + (i <= stepIdx ? "bg-primary" : "bg-secondary")} aria-hidden="true" />
              <span>{i + 1}. {s.label}<span className="sr-only">{i === stepIdx ? ", hiện tại" : i <= maxReached ? ", đã tới" : ", chưa tới"}</span></span>
            </button>
          </li>)}
        </ol>
      </nav>
      <div className="mx-auto mt-4 grid max-w-[40rem] items-start gap-8 lg:max-w-none lg:grid-cols-[minmax(0,40rem)_20rem]">
        <section className="min-w-0">
          <h1 ref={headingRef} tabIndex={-1} className="scroll-mt-4 text-2xl font-bold tracking-tight text-primary">{step.label}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{HELP[step.id]}</p>
          {unresolved && <p role="status" className="mt-4 rounded-xl bg-secondary p-4 text-sm text-primary">
            Giao dịch đã gửi. Tạm khóa chỉnh sửa để giữ đúng điều khoản đã ký. Về bước Xem lại và bấm “Kiểm tra giao dịch” để xem kết quả.
          </p>}
          <p role="status" className="mt-4 text-sm font-medium text-destructive">{hasErrors ? "Còn thông tin cần sửa. Xem lỗi bên dưới từng trường." : ""}</p>
          <fieldset ref={fieldsRef} disabled={busy || !ready || unresolved} aria-busy={busy || !ready} className="mt-4 min-w-0">
            <legend className="sr-only">{step.label}</legend>
            {step.id === "info" && <InfoStep {...props} />}
            {step.id === "money" && <MoneyStep {...props} />}
            {step.id === "dates" && <DatesStep {...props} />}
            {step.id === "positions" && <PositionsStep {...props} />}
            {step.id === "prices" && <PricesStep {...props} />}
            {step.id === "review" && <ReviewStep {...props} goto={edit} />}
          </fieldset>
        </section>
        <aside aria-label="Tóm tắt phòng đang soạn" className="min-w-0 space-y-6 lg:sticky lg:top-4 lg:-m-1 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:p-1">
          <DraftSummary draft={draft} />
          <ActionArea>
            {!ready && <p role="status" className="text-sm text-muted-foreground">Đang tải tài khoản…</p>}
            {failure && <p role="alert" className="text-sm font-medium text-destructive [overflow-wrap:anywhere]">{failure}</p>}
            {phase.name === "preparing" && <Progress text="Đang chuẩn bị đăng phòng…" />}
            {phase.name === "uploading" && <Progress text={`Đang tải ảnh ${phase.done + 1}/${phase.total}…`} />}
            {phase.name === "terms" && <Progress text="Đang chuẩn bị điều khoản…" />}
            {phase.name === "checking" && <Progress text="Đang kiểm tra giao dịch đã gửi…" />}
            {phase.name === "confirming" && <Progress text="Đang ghi nhận phòng…" />}
            {(phase.name === "signing" || transaction.phase !== "idle") && <TxStatus state={transaction} doneText="Đã xác nhận đăng phòng" />}
            <div className="flex gap-3">
              {stepIdx > 0 && <Button variant="outline" disabled={busy || !ready} onClick={() => go(stepIdx - 1)}>Quay lại</Button>}
              <Button ref={primaryRef} className="min-w-0 flex-1" disabled={busy || !ready}
                onClick={last ? publish : () => advance(returnTo ?? stepIdx + 1)}>
                {busy && <Loader2 className="shrink-0 animate-spin" aria-hidden="true" />}
                {busy ? (phase.name === "checking" ? "Đang kiểm tra…" : "Đang đăng…")
                  : last ? (unresolved ? "Kiểm tra giao dịch" : transaction.phase === "error" || failure ? "Thử đăng lại" : "Đăng phòng")
                  : returnTo !== null ? "Xong, về xem lại" : "Tiếp tục"}
              </Button>
            </div>
            {last && <p className="text-xs text-muted-foreground">{unresolved ? "Giao dịch đã gửi đi. Chỉ kiểm tra kết quả, không ký lại." : "Ký một giao dịch. Bản thử nghiệm dùng tiền test trên Fuji."}</p>}
          </ActionArea>
        </aside>
      </div>
    </div>
  </PageShell>;
}

function DraftSummary({ draft }: { draft: ListingDraft }) {
  const amount = (value: string) => { const n = parseVndInput(value); return n === null ? "Chưa nhập" : formatVnd(n); };
  return <section className="space-y-4 rounded-2xl bg-secondary p-5">
    <h2 className="font-bold text-primary">Phòng đang soạn</h2>
    <div className="space-y-1 [overflow-wrap:anywhere]">
      <p className="font-semibold">{draft.title || "Chưa có tiêu đề"}</p>
      <p className="text-sm text-muted-foreground">{draft.address || "Chưa có địa chỉ"}</p>
    </div>
    <dl className="space-y-3 text-sm">
      {[ ["Tiền cọc", amount(draft.depositVnd)], ["Phí giữ chỗ (trong cọc)", amount(draft.reserveVnd)],
        ["Dọn vào", draft.moveIn ? formatDate(dateToIso(draft.moveIn)) : "Chưa chọn"],
        ["Hết hạn thuê", draft.leaseEnd ? formatDate(dateToIso(draft.leaseEnd)) : "Chưa chọn"],
      ].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-3 gap-y-1"><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums [overflow-wrap:anywhere]">{value}</dd></div>)}
    </dl>
    <p className="text-sm text-muted-foreground">{draft.photos.length} ảnh phòng · {draft.positions.filter(p => p.photo).length}/{draft.positions.length} ảnh ví dụ</p>
    <p className="flex gap-2 border-t border-border pt-4 text-sm text-muted-foreground"><Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />Chưa công khai. Bạn còn sửa được trước khi ký đăng phòng.</p>
  </section>;
}

function Progress({ text }: { text: string }) {
  return <div role="status" className="flex items-start gap-2 text-sm text-info"><Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" /><span>{text}</span></div>;
}

function Done({ dealId, hash }: { dealId: number; hash?: `0x${string}` }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <PageShell size="read" className="py-12">
    <section className="mx-auto max-w-xl space-y-5">
      <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold text-primary">Đã đăng phòng</h1>
      <p>Phòng #{dealId} đã được tạo. Ai gửi cọc trước sẽ thuê phòng.</p>
      {hash && <TxStatus state={{ phase: "success", hash }} doneText="Giao dịch đăng phòng" />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Button asChild size="lg"><Link href={`/rooms/${dealId}`}>Xem phòng của tôi</Link></Button>
        <Button asChild size="lg" variant="outline"><Link href="/">Về trang chủ</Link></Button>
      </div>
    </section>
  </PageShell>;
}
