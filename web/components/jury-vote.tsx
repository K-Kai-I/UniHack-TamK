"use client";
// Màn "Bỏ phiếu" (bồi thẩm, docs/user-flow.md > Danh sách màn hình, P1, GĐ 3 và 6).
// Bồi thẩm xem bằng chứng (GET /disputes/:id: chỉ các vị trí bị tranh chấp) rồi chọn MỘT bên bằng vote(id, side).
// Bồi thẩm không nhập số tiền: chọn chủ trọ = chốt con số của chủ trọ, chọn người thuê = chốt con số của người thuê
// (loại MISMATCH: phòng đúng hay sai mô tả). Bên nào đủ 2 phiếu thì contract chia tiền ngay trong giao dịch đó.
// Phiếu AI (nếu có con dấu) đã được contract cộng sẵn lúc mở tranh chấp.
// Hai bên của hợp đồng cũng mở được màn này ("Xem phiếu"), chỉ xem, không bỏ phiếu (PartyCannotVote).
//
// Tách hai lớp như my-deals.tsx: JuryVote lo dữ liệu, quyền (đọc contract) và giao dịch; JuryVoteView chỉ trình bày.
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useReadContract } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { zeroAddress } from "viem";
import {
  Bot,
  Check,
  CheckCircle2,
  CircleAlert,
  Gavel,
  Hourglass,
  Loader2,
  Scale,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VERDICT } from "@/components/damage-report";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { Blocked, InfoBox, NoteQuote, Row, Rows } from "@/components/deal-bits";
import { ActionArea } from "@/components/action-area";
import { EvidencePhoto } from "@/components/evidence-photo";
import { KIND_LABEL } from "@/components/jury-list";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { PageColumns, PageShell } from "@/components/page-shell";
import { PokeButton, useCanPoke } from "@/components/poke-button";
import { TxStatus } from "@/components/tx-status";
import { addresses, chain, escrowAbi } from "@/lib/chain";
import { ApiClientError } from "@/lib/client/api";
import { PAID_STATES, aiVoteSide, juryExpiryText, roleOf } from "@/lib/client/deal-actions";
import { formatDateTime } from "@/lib/client/date";
import { DEALS_MOCK, fetchDealView, NotFoundError, type DealView } from "@/lib/client/deals-data";
import { fetchDispute, type DisputeEvidence, type DisputeView } from "@/lib/client/disputes-api";
import { amountToVnd, formatVnd } from "@/lib/client/money";
import { formatDuration, useCountdown } from "@/lib/client/use-countdown";
import { useTx, type TxState } from "@/lib/client/use-tx";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import type { Address } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Side = "landlord" | "tenant";
/** enum Side { NONE, LANDLORD, TENANT } trong contract. */
const SIDE_CODE: Record<Side, number> = { landlord: 1, tenant: 2 };
const SIDE_LABEL: Record<Side, string> = { landlord: "Chủ trọ", tenant: "Người thuê" };

/**
 * Quyền của người đang xem, suy ra từ vai trong hợp đồng và contract (isJuror, hasVoted):
 * party = một bên của hợp đồng; juror = bỏ phiếu được; voted = đã bỏ; not-juror = ví không phải bồi thẩm;
 * checking = đang đọc contract; check-failed = đọc contract lỗi; logged-out = chưa đăng nhập.
 */
export type JuryAccess = "party" | "juror" | "voted" | "not-juror" | "checking" | "check-failed" | "logged-out";

// ------------------------------------------------------------------ dữ liệu và quyền

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

  // Deal đã SETTLED/REFUNDED theo đường thường (không ai kháng nghị) thì API vẫn trả 200 với kind = NONE.
  const noDispute =
    (dispute.error instanceof ApiClientError && dispute.error.code === "WRONG_STATE") ||
    d?.onchain.disputeKind === "NONE" ||
    dispute.data?.kind === "NONE";
  if (noDispute) {
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
  if (!d || !dispute.data) return <VoteSkeleton back={back} />;
  return <JuryVoteScreen deal={d} dispute={dispute.data} back={back} onExpire={() => deal.refetch()} />;
}

function JuryVoteScreen({
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
  const { ready, authenticated, login } = usePrivy();
  const { address } = useAccount();
  const qc = useQueryClient();
  const tx = useTx();

  const role = roleOf(deal, address);
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

  // Chưa đọc xong hasVoted thì chưa hiện ô bỏ phiếu: bồi thẩm đã bỏ phiếu bấm vào sẽ bị revert AlreadyVoted.
  // Đọc lỗi thì nói là lỗi, không coi như "ví này không phải bồi thẩm".
  let access: JuryAccess;
  if (role !== "viewer") access = "party";
  else if (DEALS_MOCK) access = "juror";
  else if (!address) access = ready && !authenticated ? "logged-out" : "checking";
  else if (juror.isError || voted.isError) access = "check-failed";
  else if (juror.isPending || voted.isPending) access = "checking";
  else if (voted.data === true) access = "voted";
  else access = juror.data === true ? "juror" : "not-juror";

  async function sign(side: Side) {
    const receipt = await tx.run({
      address: addresses.escrow,
      abi: escrowAbi,
      functionName: "vote",
      args: [BigInt(deal.dealId), SIDE_CODE[side]],
    });
    if (!receipt) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] }),
      qc.invalidateQueries({ queryKey: ["dispute", deal.dealId] }),
      qc.invalidateQueries({ queryKey: ["juror-disputes"] }),
      voted.refetch(),
    ]);
  }

  return (
    <JuryVoteView
      deal={deal}
      dispute={dispute}
      back={back}
      rate={rate}
      access={access}
      tx={tx.state}
      onSign={sign}
      onLogin={login}
      onRecheck={() => {
        juror.refetch();
        voted.refetch();
      }}
      onExpire={onExpire}
    />
  );
}

function VoteSkeleton({ back }: { back: string }) {
  return (
    <PageShell aria-busy="true">
      <PageHeader href={back} backLabel="Quay lại" title="Bỏ phiếu" />
      <p role="status" className="sr-only">
        Đang tải vụ…
      </p>
      <div className="mt-2 mb-6 space-y-3">
        <Skeleton className="h-6 w-40 rounded-full" />
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

// ------------------------------------------------------------------ trình bày

export interface JuryVoteViewProps {
  deal: DealView;
  dispute: DisputeView;
  back: string;
  rate: number;
  access: JuryAccess;
  tx: TxState;
  onSign: (side: Side) => void;
  onLogin: () => void;
  onRecheck: () => void;
  onExpire: () => void;
}

/** Chỉ trình bày: không đọc ví, không gọi contract. Lựa chọn của bồi thẩm (mặc định chưa chọn bên nào) giữ ở đây. */
export function JuryVoteView({
  deal,
  dispute,
  back,
  rate,
  access,
  tx,
  onSign,
  onLogin,
  onRecheck,
  onExpire,
}: JuryVoteViewProps) {
  const vnd = (a: bigint | string) => formatVnd(amountToVnd(a, rate));
  const [choice, setChoice] = useState<Side | null>(null);

  const o = deal.onchain;
  const kind = o.disputeKind === "MISMATCH" ? "MISMATCH" : "DEDUCTION";
  const open = o.state === "DISPUTED";
  const paid = PAID_STATES.includes(o.state);
  const { passed, msLeft } = useCountdown(open ? o.deadline : null, onExpire);
  const canPoke = useCanPoke(deal);

  const busy = tx.phase === "signing" || tx.phase === "pending";
  const done = tx.phase === "success";
  const canVote = open && !passed && access === "juror" && !done;
  const aiSide = aiVoteSide(deal, dispute.aiVerdict);
  const receiptHref = `/deals/${deal.dealId}/receipt`;
  const needLogin = open && !passed && access === "logged-out";
  const recheck = open && !passed && access === "check-failed";
  const hasAction = canPoke || paid || done || canVote || needLogin || recheck || tx.phase !== "idle";

  const question =
    kind === "MISMATCH" ? "Phòng có đúng như lúc đăng tin không?" : "Mức trừ tiền cọc nào hợp lý hơn?";
  const intro =
    access === "party"
      ? "Bạn là một bên của hợp đồng nên chỉ xem được: phiếu hiện có và bằng chứng mà bồi thẩm đang xem."
      : kind === "MISMATCH"
        ? "Xem ảnh lúc đăng tin cạnh ảnh thực tế, rồi chọn bên bạn thấy đúng. Bạn không nhập số tiền."
        : "Xem ảnh nhận phòng cạnh ảnh trả phòng, rồi chọn con số của một bên. Bạn không nhập số tiền.";

  return (
    <>
      <NetworkBanner />
      <PageShell>
        <PageHeader href={back} backLabel="Quay lại" title={access === "party" ? "Phiếu bồi thẩm" : "Bỏ phiếu"} />
        <header className="mt-2 mb-6 space-y-3 [overflow-wrap:anywhere]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <DealStatusBadge state={o.state} />
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              <Gavel className="size-4" aria-hidden="true" /> {KIND_LABEL[kind]}
            </span>
            <span className="text-sm text-muted-foreground">Hợp đồng #{deal.dealId}</span>
          </div>
          <h1 className="max-w-[36ch] text-2xl leading-snug font-extrabold tracking-tight text-balance text-primary sm:text-3xl">
            {question}
          </h1>
          <p className="text-muted-foreground">{deal.terms.room.title}</p>
          <p className="max-w-[65ch] text-foreground/80">{intro}</p>
        </header>

        <PageColumns className="lg:grid-rows-[auto_1fr] lg:gap-y-4">
          <div className="min-w-0 space-y-6 lg:col-start-2 lg:row-start-1">
            {open && o.deadline && msLeft !== null && (
              <JuryDeadline deadline={o.deadline} passed={passed} msLeft={msLeft} expiry={juryExpiryText(deal, (a) => vnd(a))} />
            )}
            <Scoreboard deal={deal} aiSide={aiSide} />
            {kind === "DEDUCTION" ? <DeductionFacts deal={deal} vnd={vnd} /> : <MismatchFacts dispute={dispute} />}
          </div>

          <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <EvidenceSection kind={kind} items={dispute.evidence} vnd={vnd} />
            {kind === "DEDUCTION" && deal.terms.priceList.length > 0 && (
              <details className="rounded-2xl bg-card ring-1 ring-foreground/10">
                <summary className="min-h-11 cursor-pointer px-4 py-3 font-semibold text-primary select-none">
                  Bảng giá trong hợp đồng
                </summary>
                <Rows className="rounded-t-none ring-0">
                  {deal.terms.priceList.map((p) => (
                    <Row key={p.id} label={`${p.item} (${p.unit})`} value={vnd(p.priceAmount)} />
                  ))}
                </Rows>
              </details>
            )}
          </div>

          <div className="min-w-0 space-y-6 lg:col-start-2 lg:row-start-2">
            <Sides
              deal={deal}
              kind={kind}
              vnd={vnd}
              selectable={canVote}
              choice={choice}
              onChoose={setChoice}
              disabled={busy}
            />
            <Notices access={access} open={open} paid={paid} passed={passed} done={done} />
            {hasAction && (
              <ActionArea>
                <PokeButton deal={deal} receiptHref={receiptHref} />
                {tx.phase !== "idle" && (
                  <TxStatus
                    state={tx}
                    doneText={paid ? "Đã bỏ phiếu, đủ 2 phiếu nên contract đã chia tiền" : "Đã bỏ phiếu"}
                  />
                )}
                {paid ? (
                  <Button asChild size="lg" className="w-full text-base">
                    <Link href={receiptHref}>Xem biên nhận</Link>
                  </Button>
                ) : done ? (
                  <Button asChild size="lg" variant="outline" className="w-full text-base">
                    <Link href="/jury">Về danh sách vụ</Link>
                  </Button>
                ) : canVote ? (
                  <>
                    {!choice && (
                      <p id="vote-need" className="text-sm text-muted-foreground">
                        Chọn một bên ở trên rồi ký phiếu.
                      </p>
                    )}
                    <Button
                      size="lg"
                      className="w-full text-base"
                      disabled={busy || !choice}
                      aria-describedby={choice ? undefined : "vote-need"}
                      onClick={() => choice && onSign(choice)}
                    >
                      {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                      {!choice
                        ? "Ký phiếu"
                        : tx.phase === "error"
                          ? `Thử lại: ký phiếu cho ${SIDE_LABEL[choice].toLowerCase()}`
                          : `Ký phiếu cho ${SIDE_LABEL[choice].toLowerCase()}`}
                    </Button>
                  </>
                ) : needLogin ? (
                  <Button size="lg" className="w-full text-base" onClick={onLogin}>
                    Đăng nhập để bỏ phiếu
                  </Button>
                ) : recheck ? (
                  <Button size="lg" variant="outline" className="w-full text-base" onClick={onRecheck}>
                    Kiểm tra lại quyền bỏ phiếu
                  </Button>
                ) : null}
              </ActionArea>
            )}
          </div>
        </PageColumns>
      </PageShell>
    </>
  );
}

// ------------------------------------------------------------------ các khối

function JuryDeadline({
  deadline,
  passed,
  msLeft,
  expiry,
}: {
  deadline: string;
  passed: boolean;
  msLeft: number;
  expiry: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl px-4 py-3 ring-1",
        passed ? "bg-destructive/5 ring-destructive/20" : "bg-warning/10 ring-warning/30",
      )}
    >
      <Hourglass className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="font-semibold">
          {passed ? (
            "Đã hết hạn bỏ phiếu"
          ) : (
            <span className="tabular-nums">Còn {formatDuration(msLeft)} để bỏ phiếu</span>
          )}
        </p>
        <p className="text-muted-foreground">Hạn: {formatDateTime(deadline)}</p>
        <p className="text-foreground/80">Hết hạn mà chưa bên nào đủ 2 phiếu: {expiry}</p>
      </div>
    </div>
  );
}

/** Số phiếu hai bên, mốc thắng là 2. Phiếu AI (cộng sẵn lúc mở tranh chấp) tách riêng khỏi phiếu bồi thẩm. */
function Scoreboard({ deal, aiSide }: { deal: DealView; aiSide: Side | null }) {
  const o = deal.onchain;
  const sides: { side: Side; votes: number }[] = [
    { side: "landlord", votes: o.votesLandlord },
    { side: "tenant", votes: o.votesTenant },
  ];
  return (
    <section aria-labelledby="jv-score" className="space-y-2">
      <h2 id="jv-score" className="text-lg font-bold">
        Số phiếu
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {sides.map(({ side, votes }) => {
          const ai = aiSide === side ? Math.min(1, votes) : 0;
          const jurors = votes - ai;
          return (
            <div key={side} className="space-y-2 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
              <p className="text-sm text-muted-foreground">{SIDE_LABEL[side]}</p>
              <p className="text-3xl font-extrabold text-primary tabular-nums">
                {votes}
                <span className="text-base font-semibold text-muted-foreground">/2 phiếu</span>
              </p>
              <div className="flex gap-1.5" aria-hidden="true">
                {[0, 1].map((i) => (
                  <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < votes ? "bg-primary" : "bg-muted")} />
                ))}
              </div>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Bot className="size-3.5" aria-hidden="true" /> AI {ai}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Gavel className="size-3.5" aria-hidden="true" /> Bồi thẩm {jurors}
                </span>
              </p>
              {votes >= 2 && <p className="text-xs font-semibold text-success">Đủ 2 phiếu</p>}
            </div>
          );
        })}
      </div>
      <p className="max-w-[65ch] text-sm text-muted-foreground">
        {aiSide
          ? `Phiếu AI (từ con dấu AI) đã được contract cộng sẵn cho ${SIDE_LABEL[aiSide].toLowerCase()} lúc mở tranh chấp. `
          : "Vụ này không có phiếu AI. "}
        Bên nào đủ 2 phiếu thì thắng ngay.
      </p>
    </section>
  );
}

function DeductionFacts({ deal, vnd }: { deal: DealView; vnd: (a: bigint | string) => string }) {
  const o = deal.onchain;
  return (
    <Rows>
      <Row label="Tiền cọc" value={vnd(o.deposit)} />
      {o.hasAiSeal ? (
        <Row label="AI tính theo bảng giá (có con dấu)" value={vnd(o.aiAmount)} />
      ) : (
        <Row label="Con số AI" value="Không có con dấu" />
      )}
    </Rows>
  );
}

const MISMATCH_AI: Record<string, string> = {
  MISMATCH: "Khác rõ so với lúc đăng tin",
  UNCLEAR: "Ảnh chưa đủ rõ để kết luận",
  MATCH: "Giống lúc đăng tin",
};

/** Kết luận AI cho vụ phòng sai mô tả: tông trung tính, không tô màu thiên về bên nào. */
function MismatchFacts({ dispute }: { dispute: DisputeView }) {
  const label = dispute.aiVerdict ? MISMATCH_AI[dispute.aiVerdict] : null;
  return (
    <InfoBox
      icon={<Sparkles className="size-5" aria-hidden="true" />}
      title={label ? `AI kết luận: ${label}` : "Không có kết luận AI"}
    >
      {dispute.aiReasons && dispute.aiReasons.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-4">
          {dispute.aiReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : (
        <p>AI không nêu lý do. Hãy tự so ảnh lúc đăng tin với ảnh thực tế.</p>
      )}
    </InfoBox>
  );
}

function EvidenceSection({
  kind,
  items,
  vnd,
}: {
  kind: "DEDUCTION" | "MISMATCH";
  items: DisputeEvidence[];
  vnd: (a: bigint | string) => string;
}) {
  return (
    <section aria-labelledby="jv-evidence" className="space-y-4">
      <div className="space-y-1">
        <h2 id="jv-evidence" className="text-lg font-bold">
          Bằng chứng
        </h2>
        <p className="max-w-[65ch] text-sm text-muted-foreground">
          {kind === "DEDUCTION"
            ? "Chỉ hiện các vị trí AI thấy có thay đổi, cùng góc chụp lúc nhận và trả phòng. "
            : "Mỗi vị trí có ảnh chủ trọ chụp lúc đăng tin và ảnh người thuê chụp khi đến phòng. "}
          Ảnh hiện đủ khung, không cắt; mở ảnh gốc để xem rõ chi tiết.
        </p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          Không có vị trí nào để so.
        </p>
      ) : (
        <ul className="space-y-5">
          {items.map((e, i) => (
            <EvidenceCard key={e.positionId} item={e} index={i + 1} kind={kind} vnd={vnd} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EvidenceCard({
  item,
  index,
  kind,
  vnd,
}: {
  item: DisputeEvidence;
  index: number;
  kind: "DEDUCTION" | "MISMATCH";
  vnd: (a: bigint | string) => string;
}) {
  const [beforeLabel, afterLabel] =
    kind === "MISMATCH" ? ["Lúc đăng tin", "Thực tế (người thuê chụp)"] : ["Nhận phòng", "Trả phòng"];
  const v = item.aiVerdict ? VERDICT[item.aiVerdict] : null;
  const charged = item.aiAmount ? BigInt(item.aiAmount) > 0n : false;

  return (
    <li className="space-y-4 rounded-2xl border bg-card p-4 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 font-semibold">
          <span className="mr-2 text-sm font-normal text-muted-foreground tabular-nums">{index}.</span>
          {item.name}
        </h3>
        {v && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              v.cls,
            )}
          >
            <v.Icon className="size-3.5 shrink-0" aria-hidden="true" />
            AI: {v.label}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <EvidencePhoto
          label={beforeLabel}
          url={item.beforeUrl}
          alt={`${item.name}: ${beforeLabel.toLowerCase()}`}
          empty={item.beforeUrl ? null : "Không có ảnh vị trí này"}
        />
        <EvidencePhoto
          label={afterLabel}
          url={item.afterUrl}
          alt={`${item.name}: ${afterLabel.toLowerCase()}`}
          empty={item.afterUrl ? null : "Không có ảnh vị trí này"}
        />
      </div>
      {(item.aiDescription || charged) && (
        <div className="space-y-2 text-sm">
          {item.aiDescription && <p className="text-foreground/90">AI nhận xét: {item.aiDescription}</p>}
          {charged && (
            <p className="flex items-baseline justify-between gap-3 rounded-lg bg-secondary/60 px-3 py-2">
              <span>AI tính theo bảng giá</span>
              <span className="font-bold text-primary tabular-nums">{vnd(item.aiAmount!)}</span>
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Hai bên đối xứng: cùng cấu trúc, cùng cỡ chữ, cùng thứ tự (chủ trọ trước, người thuê sau như bảng số phiếu).
 * Mỗi bên nêu con số/ý kiến của họ và tiền mỗi người dự kiến nhận nếu bên đó thắng (contract `_resolve`, `_payout`).
 * selectable = true: là ô chọn một trong hai, mặc định chưa chọn bên nào. false: chỉ để xem.
 */
function Sides({
  deal,
  kind,
  vnd,
  selectable,
  choice,
  onChoose,
  disabled,
}: {
  deal: DealView;
  kind: "DEDUCTION" | "MISMATCH";
  vnd: (a: bigint | string) => string;
  selectable: boolean;
  choice: Side | null;
  onChoose: (s: Side) => void;
  disabled: boolean;
}) {
  const o = deal.onchain;
  const C = BigInt(o.deposit);
  const R = BigInt(o.reserveFee);
  const hasYield = o.yieldGross !== "0";

  // NORMAL: người thuê C − D, chủ trọ D. Phòng sai mô tả: chủ trọ thắng (NO_SHOW) = người thuê C − R, chủ trọ R;
  // người thuê thắng (MISMATCH) = hoàn đủ C, chủ trọ 0.
  const opts: { side: Side; claim: string; tenant: bigint; landlord: bigint }[] =
    kind === "DEDUCTION"
      ? [
          { side: "landlord", claim: `Trừ ${vnd(o.proposedAmount)}`, tenant: C - BigInt(o.proposedAmount), landlord: BigInt(o.proposedAmount) },
          { side: "tenant", claim: `Trừ ${vnd(o.counterAmount)}`, tenant: C - BigInt(o.counterAmount), landlord: BigInt(o.counterAmount) },
        ]
      : [
          { side: "landlord", claim: "Phòng đúng như mô tả", tenant: C - R, landlord: R },
          { side: "tenant", claim: "Phòng sai mô tả", tenant: C, landlord: 0n },
        ];

  const body = (op: (typeof opts)[number]) => (
    <>
      <span className="block text-sm text-muted-foreground">
        {kind === "DEDUCTION" ? `Theo ${SIDE_LABEL[op.side].toLowerCase()}` : `${SIDE_LABEL[op.side]} cho rằng`}
      </span>
      <span className="mt-0.5 block text-lg font-extrabold text-primary tabular-nums [overflow-wrap:anywhere]">
        {op.claim}
      </span>
      <span className="mt-2 block space-y-0.5 text-sm text-foreground/80">
        <span className="flex flex-wrap justify-between gap-x-3">
          <span>Người thuê dự kiến nhận</span>
          <span className="ml-auto font-semibold tabular-nums">{vnd(op.tenant)}</span>
        </span>
        <span className="flex flex-wrap justify-between gap-x-3">
          <span>Chủ trọ dự kiến nhận</span>
          <span className="ml-auto font-semibold tabular-nums">{vnd(op.landlord)}</span>
        </span>
      </span>
    </>
  );

  // Lý do hai bên tự ghi (ngoài chuỗi) giúp bồi thẩm hiểu vì sao mỗi bên đưa ra con số của mình.
  const reasons = kind === "DEDUCTION" && (deal.notes?.proposal || deal.notes?.dispute) ? (
    <div className="space-y-2">
      <NoteQuote who="chủ trọ" text={deal.notes?.proposal?.text} />
      <NoteQuote who="người thuê" text={deal.notes?.dispute?.text} />
    </div>
  ) : null;

  const note = (
    <p className="max-w-[65ch] text-sm text-muted-foreground">
      Dự kiến. Tiền chỉ về ví khi đủ 2 phiếu và contract chia xong.{hasYield && " Chưa tính phần lãi."}
    </p>
  );

  if (!selectable) {
    return (
      <section aria-labelledby="jv-sides" className="space-y-3">
        <h2 id="jv-sides" className="text-lg font-bold">
          Hai bên đang tranh
        </h2>
        <div className="grid gap-3">
          {opts.map((op) => (
            <div key={op.side} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
              {body(op)}
            </div>
          ))}
        </div>
        {reasons}
        {note}
      </section>
    );
  }

  return (
    <fieldset className="min-w-0 space-y-3" disabled={disabled}>
      <legend className="mb-3 text-lg font-bold">Phiếu của bạn</legend>
      <p id="vote-hint" className="max-w-[65ch] text-sm text-muted-foreground">
        Chọn một bên. Bạn không nhập số tiền: bên nào đủ 2 phiếu thì contract chia theo{" "}
        {kind === "DEDUCTION" ? "con số của bên đó" : "kết luận của bên đó"}.
      </p>
      <div className="grid gap-3">
        {opts.map((op) => {
          const on = choice === op.side;
          return (
            <label
              key={op.side}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl bg-card p-4 ring-1 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 motion-reduce:transition-none",
                on ? "bg-secondary/40 ring-2 ring-primary" : "ring-foreground/10 hover:bg-secondary/40",
              )}
            >
              <input
                type="radio"
                name="vote-side"
                value={op.side}
                checked={on}
                onChange={() => onChoose(op.side)}
                aria-describedby="vote-hint"
                className="sr-only"
              />
              <span
                className={cn(
                  "mt-1 grid size-5 shrink-0 place-items-center rounded-full ring-2",
                  on ? "bg-primary text-primary-foreground ring-primary" : "ring-foreground/30",
                )}
                aria-hidden="true"
              >
                {on && <Check className="size-3.5" />}
              </span>
              <span className="block min-w-0 flex-1">{body(op)}</span>
            </label>
          );
        })}
      </div>
      {reasons}
      {note}
      <p className="text-sm text-muted-foreground">Mỗi bồi thẩm một phiếu. Ký xong không đổi được.</p>
    </fieldset>
  );
}

/** Thông báo theo quyền và trạng thái vụ; nút hành động nằm ở ActionArea. */
function Notices({
  access,
  open,
  paid,
  passed,
  done,
}: {
  access: JuryAccess;
  open: boolean;
  paid: boolean;
  passed: boolean;
  done: boolean;
}) {
  const items: ReactNode[] = [];
  if (paid) {
    items.push(
      <InfoBox key="paid" icon={<CheckCircle2 className="size-5" aria-hidden="true" />} tone="success" title="Vụ này đã phân xử xong">
        Tiền cọc đã được contract chia. Xem ai nhận bao nhiêu ở biên nhận.
      </InfoBox>,
    );
  } else if (open) {
    if (access === "party") {
      items.push(
        <InfoBox key="party" icon={<Scale className="size-5" aria-hidden="true" />} title="Bạn là một bên của hợp đồng">
          Hai bên không được bỏ phiếu. Bạn theo dõi phiếu và bằng chứng bồi thẩm đang xem.
        </InfoBox>,
      );
    } else if (access === "not-juror") {
      items.push(
        <InfoBox key="nj" icon={<Scale className="size-5" aria-hidden="true" />} title="Ví này không phải bồi thẩm">
          Bạn xem được bằng chứng nhưng không bỏ phiếu được. Nếu bạn là bồi thẩm, đăng nhập lại đúng ví đã được thêm.
        </InfoBox>,
      );
    } else if (access === "checking") {
      items.push(
        <p key="chk" role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Đang kiểm tra quyền bỏ phiếu của ví này…
        </p>,
      );
    } else if (access === "check-failed") {
      items.push(
        <InfoBox key="cf" icon={<ShieldAlert className="size-5" aria-hidden="true" />} tone="warning" title="Chưa kiểm tra được quyền bỏ phiếu">
          Không đọc được contract nên chưa biết ví này bỏ phiếu được không. Kiểm tra mạng rồi thử lại.
        </InfoBox>,
      );
    } else if (access === "voted" && !done) {
      items.push(
        <InfoBox key="voted" icon={<Check className="size-5" aria-hidden="true" />} tone="success" title="Bạn đã bỏ phiếu cho vụ này">
          Mỗi bồi thẩm một phiếu, không đổi được.
        </InfoBox>,
      );
    }
    if (passed && (access === "juror" || access === "voted" || access === "not-juror")) {
      items.push(
        <InfoBox key="late" icon={<CircleAlert className="size-5" aria-hidden="true" />} tone="danger" title="Không bỏ phiếu được nữa">
          Hết hạn thì hợp đồng tự chia tiền theo quy tắc ở trên.
        </InfoBox>,
      );
    }
  }
  return items.length ? <div className="space-y-3">{items}</div> : null;
}
