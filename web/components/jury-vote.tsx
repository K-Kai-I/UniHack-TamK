"use client";
// Màn "Bỏ phiếu" (bồi thẩm, docs/user-flow.md > Danh sách màn hình, P1, GĐ 3 và 6).
// Bồi thẩm xem bằng chứng (GET /disputes/:id: chỉ các vị trí bị tranh chấp) rồi chọn MỘT bên bằng vote(id, side).
// Bồi thẩm không nhập số tiền: chọn chủ trọ = chốt con số của chủ trọ, chọn người thuê = chốt con số của người thuê
// (loại MISMATCH: phòng đúng hay sai mô tả). Bên nào đủ 2 phiếu thì contract chia tiền ngay trong giao dịch đó.
// Phiếu AI (nếu có con dấu) đã được contract cộng sẵn lúc mở tranh chấp.
// Hai bên của hợp đồng cũng mở được màn này ("Xem phiếu"), chỉ xem, không bỏ phiếu (PartyCannotVote).
import { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useReadContract } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { zeroAddress } from "viem";
import { Bot, Check, CheckCircle2, Gavel, Hourglass, Loader2, Scale, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PhotoTile, VERDICT } from "@/components/damage-report";
import { BottomBar, Blocked, InfoBox, Row, Rows } from "@/components/deal-bits";
import { KIND_LABEL } from "@/components/jury-list";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { PokeButton } from "@/components/poke-button";
import { TxStatus } from "@/components/tx-status";
import { addresses, chain, escrowAbi } from "@/lib/chain";
import { ApiClientError } from "@/lib/client/api";
import { aiVoteSide, juryExpiryText, roleOf } from "@/lib/client/deal-actions";
import { DEALS_MOCK, fetchDealView, NotFoundError, type DealView } from "@/lib/client/deals-data";
import { fetchDispute, type DisputeEvidence, type DisputeView } from "@/lib/client/disputes-api";
import { amountToVnd, formatToken, formatVnd } from "@/lib/client/money";
import { formatDuration, useCountdown } from "@/lib/client/use-countdown";
import { useTx } from "@/lib/client/use-tx";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import type { Address, DealState } from "@/lib/types";
import { cn } from "@/lib/utils";

type Side = "landlord" | "tenant";
/** enum Side { NONE, LANDLORD, TENANT } trong contract. */
const SIDE_CODE: Record<Side, number> = { landlord: 1, tenant: 2 };
const PAID: DealState[] = ["SETTLED", "REFUNDED"];

export function JuryVote({ dealId }: { dealId: string }) {
  const id = /^\d+$/.test(dealId) ? Number(dealId) : null;
  const { address } = useAccount();

  const deal = useQuery({
    queryKey: ["deal-view", id],
    queryFn: () => fetchDealView(id!),
    enabled: id !== null,
    retry: (n, e) => !(e instanceof NotFoundError) && n < 2,
    // Bồi thẩm khác có thể bỏ phiếu cùng lúc: cập nhật số phiếu khi vụ còn mở.
    refetchInterval: (q) => (q.state.data?.onchain.state === "DISPUTED" ? 10_000 : false),
  });
  const dispute = useQuery({
    queryKey: ["dispute", id],
    queryFn: () => fetchDispute(id!),
    enabled: id !== null,
    retry: (n, e) => !(e instanceof NotFoundError) && !(e instanceof ApiClientError && e.code === "WRONG_STATE") && n < 2,
  });

  if (id === null || deal.error instanceof NotFoundError || dispute.error instanceof NotFoundError) {
    return <Blocked back="/jury" header="Bỏ phiếu" title="Không tìm thấy vụ này" text="Đường dẫn có thể bị sai." />;
  }
  const d = deal.data;
  const back = d && roleOf(d, address) !== "viewer" ? `/deals/${id}` : "/jury";

  if (dispute.error instanceof ApiClientError && dispute.error.code === "WRONG_STATE") {
    return (
      <Blocked
        back={`/deals/${id}`}
        header="Bỏ phiếu"
        title="Hợp đồng này không có tranh chấp"
        text="Bồi thẩm chỉ vào cuộc khi người thuê kháng nghị hoặc báo phòng sai mô tả."
      />
    );
  }
  if ((deal.error && !deal.isPending) || (dispute.error && !dispute.isPending)) {
    return (
      <Blocked back={back} header="Bỏ phiếu" title="Không tải được vụ này" text="Kiểm tra mạng rồi thử lại.">
        <Button
          onClick={() => {
            deal.refetch();
            dispute.refetch();
          }}
        >
          Thử lại
        </Button>
      </Blocked>
    );
  }
  if (!d || !dispute.data) {
    return (
      <main className="mx-auto min-h-dvh max-w-md space-y-5 px-5" aria-busy="true">
        <PageHeader href={back} backLabel="Quay lại" title="Bỏ phiếu" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="aspect-square rounded-xl" />
          <Skeleton className="aspect-square rounded-xl" />
        </div>
      </main>
    );
  }
  return <Screen deal={d} dispute={dispute.data} back={back} onExpire={() => deal.refetch()} />;
}

// ------------------------------------------------------------------ màn chính

function Screen({
  deal,
  dispute,
  back,
  onExpire,
}: {
  deal: DealView;
  dispute: DisputeView;
  back: string;
  onExpire: () => void;
}) {
  const rate = useVndRate();
  const vnd = (a: bigint | string) => formatVnd(amountToVnd(a, rate));
  const { ready, authenticated, login } = usePrivy();
  const { address } = useAccount();
  const qc = useQueryClient();
  const tx = useTx();
  const [choice, setChoice] = useState<Side | null>(null);

  const o = deal.onchain;
  const kind = o.disputeKind === "MISMATCH" ? "MISMATCH" : "DEDUCTION";
  const open = o.state === "DISPUTED";
  const { passed, msLeft } = useCountdown(open ? o.deadline : null, onExpire);
  const role = roleOf(deal, address);
  const isParty = role !== "viewer";
  const me = (address ?? zeroAddress) as Address;

  // Quyền bỏ phiếu đọc thẳng từ contract (isJuror, hasVoted), không qua server.
  const juror = useReadContract({
    address: addresses.escrow,
    abi: escrowAbi,
    functionName: "isJuror",
    args: [me],
    chainId: chain.id,
    query: { enabled: !!address && !DEALS_MOCK },
  });
  const voted = useReadContract({
    address: addresses.escrow,
    abi: escrowAbi,
    functionName: "hasVoted",
    args: [BigInt(deal.dealId), me],
    chainId: chain.id,
    query: { enabled: !!address && !DEALS_MOCK },
  });
  const isJuror = DEALS_MOCK || juror.data === true;
  const hasVoted = !DEALS_MOCK && voted.data === true;

  const busy = tx.state.phase === "signing" || tx.state.phase === "pending";
  const done = tx.state.phase === "success";
  const canVote = open && !passed && !isParty && isJuror && !hasVoted && !done;
  const aiSide = aiVoteSide(deal, dispute.aiVerdict);
  const receiptHref = `/deals/${deal.dealId}/receipt`;

  async function submit() {
    if (!choice) return;
    const receipt = await tx.run({
      address: addresses.escrow,
      abi: escrowAbi,
      functionName: "vote",
      args: [BigInt(deal.dealId), SIDE_CODE[choice]],
    });
    if (!receipt) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] }),
      qc.invalidateQueries({ queryKey: ["dispute", deal.dealId] }),
      qc.invalidateQueries({ queryKey: ["juror-disputes"] }),
      voted.refetch(),
    ]);
  }

  const question =
    kind === "MISMATCH" ? "Phòng có đúng như lúc đăng tin không?" : "Mức trừ tiền cọc nào hợp lý hơn?";

  return (
    <>
      <NetworkBanner />
      <main className="mx-auto min-h-dvh max-w-md px-5 pb-48">
        <PageHeader href={back} backLabel="Quay lại" title={isParty ? "Phiếu bồi thẩm" : "Bỏ phiếu"} />
        <div className="mt-2 space-y-7">
          <section className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <Gavel className="size-4" /> {KIND_LABEL[kind]} · Hợp đồng #{deal.dealId}
            </p>
            <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-balance text-primary">{question}</h1>
            <p className="text-muted-foreground">{deal.terms.room.title}</p>
          </section>

          {open && msLeft !== null && (
            <div
              className={cn(
                "flex items-start gap-3 rounded-2xl px-4 py-3 ring-1",
                passed ? "bg-destructive/5 ring-destructive/20" : "bg-warning/10 ring-warning/30",
              )}
            >
              <Hourglass className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="min-w-0 text-sm">
                <p className="font-semibold">
                  {passed ? "Đã hết hạn bỏ phiếu" : <span className="tabular-nums">Còn {formatDuration(msLeft)} để bỏ phiếu</span>}
                </p>
                <p className="text-foreground/80">
                  Hết hạn mà chưa bên nào đủ 2 phiếu: {juryExpiryText(deal, (a) => vnd(a))}
                </p>
              </div>
            </div>
          )}

          <Scoreboard deal={deal} aiSide={aiSide} />

          {kind === "DEDUCTION" ? <DeductionFacts deal={deal} vnd={vnd} /> : <MismatchFacts dispute={dispute} />}

          <section aria-labelledby="evidence" className="space-y-3">
            <h2 id="evidence" className="text-lg font-bold">
              Bằng chứng
            </h2>
            {kind === "DEDUCTION" && (
              <p className="text-sm text-muted-foreground">Chỉ hiện các vị trí AI thấy có thay đổi.</p>
            )}
            {dispute.evidence.length === 0 ? (
              <p className="rounded-2xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
                Không có vị trí nào để so.
              </p>
            ) : (
              <ul className="space-y-3">
                {dispute.evidence.map((e) => (
                  <EvidenceCard key={e.positionId} item={e} kind={kind} vnd={vnd} />
                ))}
              </ul>
            )}
          </section>

          {kind === "DEDUCTION" && deal.terms.priceList.length > 0 && (
            <details className="rounded-2xl bg-card ring-1 ring-foreground/10">
              <summary className="cursor-pointer px-4 py-3 font-semibold text-primary select-none">
                Bảng giá trong hợp đồng
              </summary>
              <Rows className="rounded-t-none ring-0">
                {deal.terms.priceList.map((p) => (
                  <Row key={p.id} label={`${p.item} (${p.unit})`} value={vnd(p.priceAmount)} />
                ))}
              </Rows>
            </details>
          )}

          {canVote && <Choices deal={deal} kind={kind} choice={choice} onChoose={setChoice} vnd={vnd} />}

          {!open && PAID.includes(o.state) && (
            <InfoBox icon={<CheckCircle2 className="size-5" />} tone="success" title="Vụ này đã phân xử xong">
              Tiền cọc đã được contract chia. Xem ai nhận bao nhiêu ở biên nhận.
            </InfoBox>
          )}
          {open && isParty && (
            <InfoBox icon={<Scale className="size-5" />} title="Bạn là một bên của hợp đồng">
              Hai bên không được bỏ phiếu. Màn này để bạn theo dõi phiếu và bằng chứng bồi thẩm đang xem.
            </InfoBox>
          )}
          {open && !isParty && !!address && !isJuror && !juror.isPending && (
            <InfoBox icon={<Scale className="size-5" />} title="Ví này không phải bồi thẩm">
              Bạn xem được bằng chứng nhưng không bỏ phiếu được.
            </InfoBox>
          )}
          {open && hasVoted && !done && (
            <InfoBox icon={<Check className="size-5" />} tone="success" title="Bạn đã bỏ phiếu cho vụ này">
              Mỗi bồi thẩm một phiếu, không đổi được.
            </InfoBox>
          )}
        </div>
      </main>

      <BottomBar>
        <PokeButton deal={deal} receiptHref={receiptHref} />
        {tx.state.phase !== "idle" && (
          <TxStatus
            state={tx.state}
            doneText={PAID.includes(o.state) ? "Đã bỏ phiếu, đủ 2 phiếu nên contract đã chia tiền" : "Đã bỏ phiếu"}
          />
        )}
        {PAID.includes(o.state) ? (
          <Button asChild size="lg" className="h-14 w-full text-base">
            <Link href={receiptHref}>Xem biên nhận</Link>
          </Button>
        ) : done ? (
          <Button asChild size="lg" variant="outline" className="h-12 w-full text-base">
            <Link href="/jury">Về danh sách vụ</Link>
          </Button>
        ) : canVote ? (
          <Button size="lg" className="h-14 w-full text-base" disabled={busy || !choice} onClick={submit}>
            {busy && <Loader2 className="animate-spin" />}
            {!choice
              ? "Chọn một bên ở trên"
              : tx.state.phase === "error"
                ? "Thử lại"
                : `Ký phiếu cho ${choice === "landlord" ? "chủ trọ" : "người thuê"}`}
          </Button>
        ) : open && !isParty && ready && !authenticated && !DEALS_MOCK ? (
          <Button size="lg" className="h-14 w-full text-base" onClick={login}>
            Đăng nhập để bỏ phiếu
          </Button>
        ) : null}
      </BottomBar>
    </>
  );
}

// ------------------------------------------------------------------ các khối

/** Số phiếu hai bên, mốc thắng là 2. Phiếu AI (cộng sẵn lúc mở tranh chấp) đánh dấu riêng. */
function Scoreboard({ deal, aiSide }: { deal: DealView; aiSide: Side | null }) {
  const o = deal.onchain;
  const sides: { side: Side; label: string; votes: number }[] = [
    { side: "landlord", label: "Chủ trọ", votes: o.votesLandlord },
    { side: "tenant", label: "Người thuê", votes: o.votesTenant },
  ];
  return (
    <section aria-label="Số phiếu" className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {sides.map((s) => (
          <div key={s.side} className="space-y-2 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="text-3xl font-extrabold text-primary tabular-nums">
              {s.votes}
              <span className="text-base font-semibold text-muted-foreground">/2 phiếu</span>
            </p>
            <div className="flex gap-1.5" aria-hidden>
              {[0, 1].map((i) => (
                <span
                  key={i}
                  className={cn("h-1.5 flex-1 rounded-full", i < s.votes ? (s.side === "tenant" ? "bg-success" : "bg-primary") : "bg-muted")}
                />
              ))}
            </div>
            {aiSide === s.side && (
              <p className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-primary">
                <Bot className="size-3.5" /> Có 1 phiếu AI
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {aiSide
          ? "Phiếu AI có từ con dấu của AI, contract cộng sẵn lúc mở tranh chấp."
          : "Vụ này không có phiếu AI."}{" "}
        Bên nào đủ 2 phiếu thì thắng ngay.
      </p>
    </section>
  );
}

function DeductionFacts({ deal, vnd }: { deal: DealView; vnd: (a: bigint | string) => string }) {
  const o = deal.onchain;
  return (
    <Rows>
      <Row label="Tiền cọc" value={vnd(o.deposit)} sub={formatToken(o.deposit)} />
      <Row label="Chủ trọ muốn trừ" value={vnd(o.proposedAmount)} strong />
      <Row label="Người thuê chấp nhận trừ" value={vnd(o.counterAmount)} strong tone="success" />
      {o.hasAiSeal && <Row label="AI tính (có con dấu)" value={vnd(o.aiAmount)} />}
    </Rows>
  );
}

function MismatchFacts({ dispute }: { dispute: DisputeView }) {
  const verdict =
    dispute.aiVerdict === "MISMATCH" ? "Khác rõ" : dispute.aiVerdict === "UNCLEAR" ? "Không rõ" : dispute.aiVerdict === "MATCH" ? "Giống" : null;
  return (
    <InfoBox icon={<Sparkles className="size-5" />} title={verdict ? `AI kết luận: ${verdict}` : "Không có kết luận AI"}>
      {dispute.aiReasons && dispute.aiReasons.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-4">
          {dispute.aiReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : (
        <p>AI không đưa ra lý do. Hãy tự so ảnh đăng tin với ảnh thực tế bên dưới.</p>
      )}
    </InfoBox>
  );
}

function EvidenceCard({
  item,
  kind,
  vnd,
}: {
  item: DisputeEvidence;
  kind: "DEDUCTION" | "MISMATCH";
  vnd: (a: bigint | string) => string;
}) {
  const [zoom, setZoom] = useState(false);
  const [beforeLabel, afterLabel] = kind === "MISMATCH" ? ["Lúc đăng tin", "Thực tế"] : ["Nhận phòng", "Trả phòng"];
  const v = item.aiVerdict ? VERDICT[item.aiVerdict] : null;
  const charged = item.aiAmount ? BigInt(item.aiAmount) > 0n : false;

  return (
    <li className={cn("space-y-3 rounded-2xl bg-card p-3 ring-1", charged ? "ring-destructive/30" : "ring-foreground/10")}>
      <div className="flex items-start justify-between gap-2 px-1">
        <p className="font-semibold">{item.name}</p>
        {v && <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", v.cls)}>{v.label}</span>}
      </div>
      <button
        type="button"
        onClick={() => setZoom(true)}
        aria-label={`Phóng to ảnh ${item.name}`}
        className="grid w-full grid-cols-2 gap-2 rounded-xl text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <PhotoTile url={item.beforeUrl} label={beforeLabel} alt={`${item.name}: ${beforeLabel.toLowerCase()}`} />
        <PhotoTile url={item.afterUrl} label={afterLabel} alt={`${item.name}: ${afterLabel.toLowerCase()}`} />
      </button>
      {(item.aiDescription || charged) && (
        <div className="space-y-1.5 px-1 text-sm">
          {item.aiDescription && <p className="text-foreground/90">AI: {item.aiDescription}</p>}
          {charged && (
            <p className="flex items-baseline justify-between gap-3 rounded-lg bg-destructive/5 px-3 py-2">
              <span>AI tính theo bảng giá</span>
              <span className="font-bold text-destructive tabular-nums">{vnd(item.aiAmount!)}</span>
            </p>
          )}
        </div>
      )}
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto p-3 sm:max-w-md">
          <DialogTitle className="pr-8 text-base font-bold text-primary">{item.name}</DialogTitle>
          <DialogDescription className="sr-only">
            Ảnh {beforeLabel.toLowerCase()} ở trên, ảnh {afterLabel.toLowerCase()} ở dưới.
          </DialogDescription>
          <div className="space-y-3">
            <PhotoTile url={item.beforeUrl} label={beforeLabel} alt={`${item.name}: ${beforeLabel.toLowerCase()}`} large />
            <PhotoTile url={item.afterUrl} label={afterLabel} alt={`${item.name}: ${afterLabel.toLowerCase()}`} large />
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/** Hai lựa chọn của bồi thẩm, kèm hệ quả tiền của từng lựa chọn (contract `_resolve`). */
function Choices({
  deal,
  kind,
  choice,
  onChoose,
  vnd,
}: {
  deal: DealView;
  kind: "DEDUCTION" | "MISMATCH";
  choice: Side | null;
  onChoose: (s: Side) => void;
  vnd: (a: bigint | string) => string;
}) {
  const o = deal.onchain;
  const C = BigInt(o.deposit);
  const opts: { side: Side; title: string; main: string; sub: string }[] =
    kind === "DEDUCTION"
      ? [
          {
            side: "landlord",
            title: "Theo chủ trọ",
            main: `Trừ ${vnd(o.proposedAmount)}`,
            sub: `Người thuê nhận lại ${vnd(C - BigInt(o.proposedAmount))}`,
          },
          {
            side: "tenant",
            title: "Theo người thuê",
            main: `Trừ ${vnd(o.counterAmount)}`,
            sub: `Người thuê nhận lại ${vnd(C - BigInt(o.counterAmount))}`,
          },
        ]
      : [
          {
            side: "landlord",
            title: "Phòng đúng mô tả",
            main: "Chủ trọ đúng",
            sub: `Người thuê được hoàn cọc, chủ trọ giữ phí giữ chỗ ${vnd(o.reserveFee)}`,
          },
          {
            side: "tenant",
            title: "Phòng sai mô tả",
            main: "Người thuê đúng",
            sub: `Người thuê được hoàn đủ cọc ${vnd(C)}`,
          },
        ];

  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 text-lg font-bold">Phiếu của bạn</legend>
      <div className="grid gap-2" role="radiogroup">
        {opts.map((op) => {
          const on = choice === op.side;
          return (
            <button
              key={op.side}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChoose(op.side)}
              className={cn(
                "flex items-start gap-3 rounded-2xl bg-card p-4 text-left ring-1 transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                on ? "ring-2 ring-primary" : "ring-foreground/10 hover:bg-secondary/40",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ring-2",
                  on ? "bg-primary text-primary-foreground ring-primary" : "ring-foreground/20",
                )}
                aria-hidden
              >
                {on && <Check className="size-3.5" />}
              </span>
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm text-muted-foreground">{op.title}</span>
                <span className="block text-lg font-extrabold text-primary tabular-nums">{op.main}</span>
                <span className="block text-sm text-foreground/80">{op.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">Mỗi bồi thẩm một phiếu. Ký xong không đổi được.</p>
    </fieldset>
  );
}
