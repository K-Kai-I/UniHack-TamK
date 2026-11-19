"use client";
// Màn "Chi tiết hợp đồng" (docs/user-flow.md > Danh sách màn hình, P0, GĐ 1–6), hướng A "Căn phòng qua từng mốc".
// Bố cục: tên phòng → (mobile: việc cần làm, hạn, tiền → mốc và ảnh) / (desktop: nội dung trái, tóm tắt + hành động phải).
// Nút theo bảng "Nút trên app theo trạng thái" (lib/client/deal-actions.ts), nút "Xử lý quá hạn" khi canPoke.
// Màn này là "nhà" của một hợp đồng: các màn chụp ảnh, đề xuất, trả lời, biên nhận đều mở từ đây.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useReadContract } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Clock, Gavel, Loader2, Minus, RefreshCw, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionArea } from "@/components/action-area";
import { ChainProof } from "@/components/chain-proof";
import { InfoBox, Row, Rows } from "@/components/deal-bits";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { PageColumns, PageShell } from "@/components/page-shell";
import { PokeDrawer, PokeTrigger, usePokeStage } from "@/components/poke-button";
import { isQuickTx, QuickTxDrawer, type QuickTxId } from "@/components/quick-tx";
import { EvidencePhoto } from "@/components/evidence-photo";
import { RoomCover } from "@/components/room-cover";
import { WalletChip } from "@/components/wallet-chip";
import { addresses, chain, escrowAbi } from "@/lib/chain";
import { vaultAbi } from "@/lib/abi";
import {
  actionsFor,
  checkoutForTenantFrom,
  deadlineInfo,
  juryExpiryText,
  PAID_STATES,
  roleOf,
  type ActionId,
  type DealAction,
  type Role,
} from "@/lib/client/deal-actions";
import { milestonesFor, nextStepFor, type Milestone } from "@/lib/client/deal-progress";
import { DEALS_MOCK, fetchDealView, NotFoundError, type DealView } from "@/lib/client/deals-data";
import { missingActionNote, type OverdueStage } from "@/lib/client/overdue";
import { formatDate, formatDateTime } from "@/lib/client/date";
import { amountToVnd, formatToken, formatVnd } from "@/lib/client/money";
import { formatDuration, useCountdown } from "@/lib/client/use-countdown";
import { useCheckOutGrace } from "@/lib/client/use-config";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import type { Amount } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<Role, string> = { tenant: "Người thuê", landlord: "Chủ trọ", viewer: "Người xem" };

export function DealDetail({ dealId, previewAs }: { dealId: string; previewAs?: Role }) {
  const id = /^\d+$/.test(dealId) ? Number(dealId) : null;
  const { address } = useAccount();
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["deal-view", id],
    queryFn: () => fetchDealView(id!),
    enabled: id !== null,
    retry: (n, e) => !(e instanceof NotFoundError) && n < 2,
  });

  if (id === null || error instanceof NotFoundError) return <NotFound />;

  // Vai trò thật lấy từ địa chỉ ví so với landlord/tenant trên chuỗi. `?as=` chỉ có tác dụng ở chế độ dữ liệu giả,
  // để xem thử giao diện của từng bên khi ví mình không phải hai bên của deal giả.
  const role: Role | undefined = data && (DEALS_MOCK && previewAs ? previewAs : roleOf(data, address));

  return (
    <>
      <NetworkBanner />
      <PageShell>
        <PageHeader href="/deals" backLabel="Về Hợp đồng của tôi" title={`Hợp đồng #${id}`} />
        {DEALS_MOCK && <PreviewSwitch dealId={id} current={previewAs} />}
        {isPending && <DetailSkeleton />}
        {error && !isPending && <LoadError stale={!!data} fetching={isFetching} onRetry={() => refetch()} />}
        {data && role && <DealOverview deal={data} role={role} previewAs={previewAs} onExpire={() => refetch()} />}
      </PageShell>
    </>
  );
}

// ------------------------------------------------------------------ bố cục

/** Tên phòng và địa chỉ là điểm neo; bên dưới là tóm tắt (tiền, việc, hạn) rồi mới tới ảnh và mốc. */
function DealOverview({
  deal,
  role,
  previewAs,
  onExpire,
}: {
  deal: DealView;
  role: Role;
  previewAs?: Role;
  onExpire: () => void;
}) {
  const { terms, onchain } = deal;
  const rate = useVndRate();
  const vnd = (a: Amount) => formatVnd(amountToVnd(a, rate));

  return (
    <>
      <header className="mt-2 mb-6 space-y-3 [overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <DealStatusBadge state={onchain.state} />
          <span className="text-sm text-muted-foreground">Bạn là {ROLE_LABEL[role].toLowerCase()}</span>
        </div>
        <h1 className="max-w-[36ch] text-2xl leading-snug font-extrabold tracking-tight text-balance text-primary sm:text-3xl">
          {terms.room.title}
        </h1>
        <p className="max-w-[75ch] text-muted-foreground">{terms.room.address}</p>
      </header>

      <PageColumns className="lg:grid-rows-[auto_1fr] lg:gap-y-4">
        {/* Một cây DOM: mobile xếp tóm tắt trước, desktop đặt sang cột phải (không nhân đôi nội dung). */}
        <div className="min-w-0 space-y-6 lg:col-start-2 lg:row-start-1">
          <StatusPanel deal={deal} role={role} onExpire={onExpire} />
          <MoneyPanel deal={deal} vnd={vnd} />
          <ProposalPanel deal={deal} role={role} vnd={vnd} />
        </div>

        <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <MilestoneList deal={deal} />
          <PhotoPairs deal={deal} />
          <RoomPhotos deal={deal} />
          <TermsAndParties deal={deal} />
          <ChainProof deal={deal} />
        </div>

        <ActionBar deal={deal} role={role} previewAs={previewAs} />
      </PageColumns>
    </>
  );
}

// ------------------------------------------------------------------ tóm tắt: việc cần làm + hạn

/** Việc cần làm của vai này, hạn chót đếm ngược và hệ quả nếu hết hạn (ai im lặng thì người đó chịu). */
function StatusPanel({ deal, role, onExpire }: { deal: DealView; role: Role; onExpire: () => void }) {
  const { onchain } = deal;
  const info = deadlineInfo(onchain.state, deal.photoSets.checkin !== null);
  const rate = useVndRate();
  // Tranh chấp: hệ quả hết hạn tùy loại và con dấu (bảng tranh chấp trong contract-spec), không dùng câu chung.
  const onTimeout =
    onchain.state === "DISPUTED" ? juryExpiryText(deal, (a) => formatVnd(amountToVnd(a, rate))) : info?.onTimeout;
  const { passed, msLeft, now } = useCountdown(onchain.deadline, onExpire);
  const stage = usePokeStage(deal);
  const checkoutFrom = checkoutForTenantFrom(deal, useCheckOutGrace());
  const hasDeadline = !!info && !!onchain.deadline && msLeft !== null;
  const overdue = hasDeadline && passed;
  // Hết hạn phản đối ảnh nhận phòng không phải chuyện xấu: ảnh được chấp nhận, hợp đồng chỉ chờ một lệnh poke để
  // sang Đang ở. Không hiện "Đã quá hạn" hay nút xử lý; app tự nhờ server poke (useConfirmCheckIn).
  const confirming = isConfirmingCheckIn(deal, now);
  const step = confirming
    ? { title: "Đang chuyển sang Đang ở", body: "Ảnh nhận phòng đã được chấp nhận. Hợp đồng tự chuyển sang Đang ở trong ít phút, bạn không cần làm gì.", mine: false }
    : nextStepFor(deal, role, overdue);
  const missingNote = confirming ? null : missingActionNote(deal, role, now);

  const mismatchDispute = onchain.state === "DISPUTED" && onchain.disputeKind === "MISMATCH";
  const mismatchVerdict = deal.reports.mismatch?.verdict;

  return (
    <section
      aria-labelledby="status-title"
      className={cn(
        "space-y-3 rounded-2xl p-5 [overflow-wrap:anywhere]",
        overdue && !confirming ? "bg-destructive/5 ring-1 ring-destructive/20" : "bg-secondary",
      )}
    >
      {/* Không đặt nhãn nhỏ phía trên tiêu đề (DESIGN.md); "đến lượt bạn" là badge đi sau tiêu đề. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="status-title" className="text-xl leading-snug font-extrabold text-primary">
          {step.title}
        </h2>
        {step.mine && <Badge>Đến lượt bạn</Badge>}
      </div>
      <p className="text-foreground/80">{step.body}</p>

      {onchain.state === "ACTIVE" && (
        <p className="text-sm text-foreground/80">
          Hết hạn thuê ngày <span className="font-semibold tabular-nums">{formatDate(deal.terms.dates.leaseEnd)}</span>.
          {role === "landlord" &&
            checkoutFrom !== null &&
            ` Người thuê chưa trả thì từ ${formatDateTime(new Date(checkoutFrom).toISOString())} bạn được trả phòng thay.`}
        </p>
      )}

      {(onchain.state === "MISMATCH_REPORTED" || mismatchDispute) && (
        <p className="text-sm text-foreground/80">
          {mismatchVerdict === "MISMATCH"
            ? "AI so ảnh: khác rõ so với lúc đăng tin. "
            : mismatchVerdict === "UNCLEAR"
              ? "AI so ảnh: ảnh chưa đủ rõ để kết luận. "
              : ""}
          {mismatchDispute &&
            `Bồi thẩm: chủ trọ ${onchain.votesLandlord} phiếu · người thuê ${onchain.votesTenant} phiếu${onchain.hasAiSeal ? " (đã tính phiếu của AI)" : ""}.`}
        </p>
      )}

      {confirming && (
        <p role="status" className="flex items-center gap-2 text-sm text-foreground/80">
          <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" /> Đang cập nhật trên blockchain…
        </p>
      )}

      {hasDeadline && info && !confirming && (
        <div className="space-y-1 border-t pt-3">
          <p className="text-sm font-medium text-foreground/80">{info.waiting}</p>
          <p
            className={cn("text-2xl font-extrabold tabular-nums", overdue ? "text-destructive" : "text-primary")}
            aria-live="off"
          >
            {overdue ? "Đã quá hạn" : formatDuration(msLeft)}
          </p>
          <p className="text-sm text-foreground/80">
            Hạn: <time dateTime={onchain.deadline!} className="font-semibold tabular-nums">{formatDateTime(onchain.deadline!)}</time>{" "}
            (giờ Việt Nam)
          </p>
          <OverdueNote stage={stage} overdue={overdue} onTimeout={onTimeout ?? info.onTimeout} />
        </div>
      )}

      {missingNote && <p className="border-t pt-3 text-sm text-foreground/80">{missingNote}</p>}
    </section>
  );
}

/**
 * Hạn chót nói gì sẽ xảy ra. Ba tình huống khác nhau, không gộp một câu:
 * còn hạn → hệ quả nếu im lặng; quá hạn nhưng contract chưa cho xử lý → đang chờ (nút sẽ tự hiện);
 * quá hạn và xử lý được → ai cũng bấm được, bot tự động cũng sẽ làm.
 */
export function OverdueNote({ stage, overdue, onTimeout }: { stage: OverdueStage; overdue: boolean; onTimeout: string }) {
  if (!overdue) return <p className="text-sm text-foreground/80">Hết hạn thì: {onTimeout}</p>;
  if (stage === "ready")
    return (
      <p className="text-sm text-foreground/80">
        Hạn đã qua. Ai cũng bấm được “Xử lý quá hạn” để contract chạy bước tiếp theo: {onTimeout} Bot của app thường
        xử lý khoảng mỗi phút; nút này là đường dự phòng khi bot chưa kịp hoặc ngừng chạy.
      </p>
    );
  return (
    <p role="status" className="flex items-start gap-2 text-sm text-foreground/80">
      <Loader2 className="mt-0.5 size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
      <span>
        Hạn đã qua. Đang chờ contract cho phép xử lý (thường vài giây); khi đó nút “Xử lý quá hạn” sẽ tự hiện. Kết quả
        sẽ là: {onTimeout}
      </span>
    </p>
  );
}

// ------------------------------------------------------------------ tóm tắt: tiền

/** Tiền trong contract. Hợp đồng đã kết thúc không còn "đang giữ": kết quả nằm ở biên nhận. */
function MoneyPanel({ deal, vnd }: { deal: DealView; vnd: (a: Amount) => string }) {
  const { onchain } = deal;
  const s = onchain.state;
  const finished = PAID_STATES.includes(s);

  if (s === "CANCELLED") {
    return (
      <section aria-labelledby="money" className="space-y-3">
        <h2 id="money" className="text-lg font-bold">
          Tiền cọc
        </h2>
        <p className="rounded-2xl bg-muted p-5 text-sm text-foreground/80">
          Phòng đã gỡ khi chưa có ai cọc, nên không có tiền nào đang được giữ trong contract.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="money" className="space-y-3">
      <h2 id="money" className="text-lg font-bold">
        {finished ? "Tiền cọc đã xử lý xong" : s === "OPEN" ? "Tiền cọc yêu cầu" : "Tiền cọc trong contract"}
      </h2>
      <Rows>
        <Row label={finished ? "Cọc ban đầu" : "Tiền cọc"} value={vnd(onchain.deposit)} sub={formatToken(onchain.deposit)} strong />
        <Row label="Trong đó phí giữ chỗ" value={vnd(onchain.reserveFee)} sub={formatToken(onchain.reserveFee)} />
        {onchain.yieldOn && !finished && <YieldRow deal={deal} vnd={vnd} />}
      </Rows>
      <p className="max-w-[65ch] text-sm text-muted-foreground">
        {finished
          ? "Tiền đã được chia theo contract và không còn nằm trong hợp đồng. Số tiền mỗi bên đã nhận nằm ở biên nhận."
          : s === "OPEN"
            ? "Chưa ai gửi cọc nên chưa có tiền nào trong contract. Phí giữ chỗ nằm trong tiền cọc, không cộng thêm."
            : "Phí giữ chỗ nằm trong tiền cọc, không cộng thêm lần hai."}
      </p>
    </section>
  );
}

/**
 * Lãi tạm tính khi cọc đang nằm trong vault (user-flow > Chưa có trong spec #4, P2):
 * `vault.convertToAssets(vaultShares) − deposit`, trước phí sàn. Đọc thẳng contract (không qua API) mỗi 30 giây.
 * Khi kết thúc, contract trừ phí sàn rồi chia đôi phần còn lại cho hai bên (contract-spec > Chia tiền).
 */
function YieldRow({ deal, vnd }: { deal: DealView; vnd: (a: Amount) => string }) {
  const live = !DEALS_MOCK && addresses.vault !== null;
  const d = useReadContract({
    address: addresses.escrow,
    abi: escrowAbi,
    functionName: "getDeal",
    args: [BigInt(deal.dealId)],
    chainId: chain.id,
    query: { enabled: live },
  });
  const shares = d.data?.vaultShares;
  const assets = useReadContract({
    address: addresses.vault ?? undefined,
    abi: vaultAbi,
    functionName: "convertToAssets",
    args: shares !== undefined ? [shares] : undefined,
    chainId: chain.id,
    query: { enabled: live && shares !== undefined, refetchInterval: 30_000 },
  });
  if (assets.data === undefined) return <Row label="Sinh lãi" value="Đang bật" />;
  const gain = assets.data - BigInt(deal.onchain.deposit);
  const g = (gain > 0n ? gain : 0n).toString();
  return <Row label="Lãi tạm tính" value={vnd(g)} sub={`${formatToken(g)} · trước phí sàn, chia đôi khi kết thúc`} />;
}

/** Con số chủ trọ đề xuất, số AI ký con dấu, và (nếu kháng nghị) số người thuê đưa ra + phiếu. */
function ProposalPanel({ deal, role, vnd }: { deal: DealView; role: Role; vnd: (a: Amount) => string }) {
  const { onchain } = deal;
  const show = ["PROPOSED", "DISPUTED", "SETTLED"].includes(onchain.state) && onchain.disputeKind !== "MISMATCH";
  if (!show || onchain.proposedAmount === "0") return null;

  const C = BigInt(onchain.deposit);
  const D = BigInt(onchain.proposedAmount); // bigint: tiền không đi qua number (AGENTS.md luật 8)
  const disputed = onchain.state === "DISPUTED";
  const settled = onchain.state === "SETTLED";

  return (
    <section aria-labelledby="proposal" className="space-y-3">
      <h2 id="proposal" className="text-lg font-bold">
        {settled ? "Mức trừ đã đưa ra" : "Mức trừ"}
      </h2>
      <Rows>
        <Row label="Chủ trọ đề xuất" value={vnd(onchain.proposedAmount)} strong />
        {onchain.hasAiSeal && <Row label="AI tính (có con dấu)" value={vnd(onchain.aiAmount)} />}
        {disputed && <Row label="Người thuê đưa ra" value={vnd(onchain.counterAmount)} />}
        {!disputed && !settled && (
          <Row
            label={role === "tenant" ? "Bạn nhận lại (dự kiến)" : "Người thuê nhận lại (dự kiến)"}
            value={vnd((C - D).toString())}
            sub={onchain.yieldGross !== "0" ? "chưa tính phần lãi" : undefined}
          />
        )}
      </Rows>
      {settled && <p className="text-sm text-muted-foreground">Số tiền thực nhận của mỗi bên nằm ở biên nhận.</p>}
      {disputed && (
        <InfoBox icon={<Gavel className="size-5" aria-hidden="true" />} title="Phiếu bồi thẩm (bên nào đủ 2 phiếu thì thắng)">
          Chủ trọ {onchain.votesLandlord} phiếu · Người thuê {onchain.votesTenant} phiếu
          {onchain.hasAiSeal && ". Đã tính phiếu của AI."}
        </InfoBox>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ nội dung: mốc, ảnh, điều khoản

const MILESTONE_ICON: Record<Milestone["status"], { box: string; icon: React.ReactNode; text: string }> = {
  done: {
    box: "bg-success text-success-foreground",
    icon: <Check className="size-4" aria-hidden="true" />,
    text: "text-success",
  },
  current: {
    box: "bg-primary text-primary-foreground",
    icon: <Clock className="size-4" aria-hidden="true" />,
    text: "text-primary",
  },
  upcoming: { box: "bg-background ring-2 ring-border", icon: null, text: "text-muted-foreground" },
  skipped: {
    box: "bg-muted text-muted-foreground",
    icon: <Minus className="size-4" aria-hidden="true" />,
    text: "text-muted-foreground",
  },
};

/** Năm mốc của căn phòng. Mỗi mốc có chữ trạng thái; chỉ "Đã hoàn tất" khi dữ liệu contract xác nhận. */
function MilestoneList({ deal }: { deal: DealView }) {
  const items = milestonesFor(deal);
  return (
    <section aria-labelledby="milestones" className="space-y-4">
      <h2 id="milestones" className="text-lg font-bold">
        Các mốc của căn phòng
      </h2>
      <ol aria-label="Tiến trình hợp đồng">
        {items.map((it, i) => {
          const look = MILESTONE_ICON[it.status];
          const last = i === items.length - 1;
          return (
            <li
              key={it.id}
              aria-current={it.status === "current" ? "step" : undefined}
              className={cn("relative pl-11 [overflow-wrap:anywhere]", !last && "pb-5")}
            >
              <span className={cn("absolute top-0 left-0 grid size-8 place-items-center rounded-full", look.box)}>
                {look.icon}
              </span>
              {!last && <span className="absolute top-9 bottom-1 left-4 w-px bg-border" aria-hidden="true" />}
              <p className="flex flex-wrap items-baseline gap-x-2 leading-8">
                <span className="font-semibold">{it.label}</span>
                <span className={cn("text-sm font-semibold", look.text)}>{it.statusText}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {it.note}
                {it.at && <span className="tabular-nums"> · {it.at}</span>}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Cặp ảnh cùng vị trí: "Lúc nhận phòng" cạnh "Lúc trả phòng". Ảnh contain, có lối xem ảnh gốc, không crop. */
function PhotoPairs({ deal }: { deal: DealView }) {
  const { checkin, checkout } = deal.photoSets;
  if (!checkin && !checkout) return null;
  const s = deal.onchain.state;
  const missingCheckout = ["RESERVED", "MISMATCH_REPORTED", "ACTIVE", "ABANDON_REPORTED"].includes(s)
    ? "Chưa tới mốc trả phòng"
    : "Không có ảnh trả phòng";
  const missingCheckin = s === "RESERVED" ? "Người thuê chưa gửi ảnh" : "Không có ảnh nhận phòng";

  return (
    <section aria-labelledby="pairs" className="space-y-4">
      <div className="space-y-1">
        <h2 id="pairs" className="text-lg font-bold">
          Ảnh theo từng vị trí
        </h2>
        <p className="max-w-[65ch] text-sm text-muted-foreground">
          Mỗi vị trí chụp ở cùng góc khi nhận và trả phòng. Ảnh hiện đủ khung, không cắt.
        </p>
      </div>
      <ul className="space-y-6">
        {deal.terms.positions.map((p) => {
          const find = (set: typeof checkin) => set?.items.find((it) => it.positionId === p.id);
          const inItem = find(checkin);
          const outItem = find(checkout);
          return (
            <li key={p.id} className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0 [overflow-wrap:anywhere]">
              <h3 className="font-semibold">{p.name}</h3>
              <div className="grid gap-4 min-[30rem]:grid-cols-2">
                <EvidencePhoto
                  label="Lúc nhận phòng"
                  url={inItem?.url}
                  alt={`Ảnh nhận phòng: ${p.name}`}
                  empty={checkin ? (inItem ? null : "Không có ảnh vị trí này") : missingCheckin}
                />
                <EvidencePhoto
                  label="Lúc trả phòng"
                  url={outItem?.url}
                  alt={`Ảnh trả phòng: ${p.name}`}
                  empty={checkout ? (outItem ? null : "Không có ảnh vị trí này") : missingCheckout}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Ảnh chủ trọ đăng lúc tạo phòng. Thiếu ảnh vẫn giữ khung "Chưa có ảnh", không dùng ảnh minh họa thay thế. */
function RoomPhotos({ deal }: { deal: DealView }) {
  const urls = deal.listingPhotoUrls;
  const title = deal.terms.room.title;
  return (
    <section aria-labelledby="room-photos" className="space-y-3">
      <h2 id="room-photos" className="text-lg font-bold">
        Ảnh phòng khi đăng
      </h2>
      <div className="aspect-[16/10] max-w-xl overflow-hidden rounded-2xl border bg-muted">
        <RoomCover url={urls[0] ?? null} alt={`Ảnh đăng phòng: ${title}`} fit="contain" label="Chủ trọ chưa đăng ảnh" />
      </div>
      {urls.length > 0 && (
        <ul aria-label="Ảnh gốc của phòng" className="flex flex-wrap gap-2">
          {urls.map((u, i) => (
            <li key={u + i}>
              <a
                href={u}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Xem ảnh gốc ${i + 1} trên ${urls.length} (mở thẻ mới)`}
                className="grid size-14 place-items-center overflow-hidden rounded-lg border bg-muted"
              >
                <RoomCover url={u} alt="" fit="contain" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TermsAndParties({ deal }: { deal: DealView }) {
  const { terms, onchain } = deal;
  return (
    <section aria-labelledby="parties" className="space-y-3">
      <h2 id="parties" className="text-lg font-bold">
        Thời gian thuê và hai bên
      </h2>
      <Rows>
        <Row label="Dọn vào" value={formatDate(terms.dates.moveInDate)} />
        <Row label="Hết hạn thuê" value={formatDate(terms.dates.leaseEnd)} />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3">
          <dt className="text-muted-foreground">Chủ trọ</dt>
          <dd>
            <WalletChip address={onchain.landlord} />
          </dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3">
          <dt className="text-muted-foreground">Người thuê</dt>
          <dd>
            {onchain.tenant ? (
              <WalletChip address={onchain.tenant} />
            ) : (
              <span className="text-sm text-muted-foreground">Chưa có ai cọc</span>
            )}
          </dd>
        </div>
      </Rows>
    </section>
  );
}

// ------------------------------------------------------------------ nút hành động

// Nút đã có màn/giao dịch thật. Nút còn lại hiện mờ kèm "Sắp có" cho tới khi làm xong màn tương ứng.
const READY: ActionId[] = [
  "deposit",
  "cancel",
  "checkin",
  "checkout",
  "checkoutForTenant",
  "viewReport",
  "propose",
  "respond",
  "receipt",
  "mismatch",
  "contestMismatch",
  "viewVotes",
  "reportAbandon",
  "contestAbandon",
  "contestCheckIn",
];

/** Nút mở màn khác (thay vì mở hộp thoại giao dịch tại chỗ). */
function hrefFor(id: ActionId, dealId: number, previewAs?: Role): string | null {
  const as = DEALS_MOCK && previewAs ? `as=${previewAs}` : "";
  const q = (...parts: string[]) => {
    const s = parts.filter(Boolean).join("&");
    return s ? `?${s}` : "";
  };
  if (id === "checkin") return `/deals/${dealId}/photos${q("kind=checkin", as)}`;
  if (id === "checkout" || id === "checkoutForTenant") return `/deals/${dealId}/photos${q("kind=checkout", as)}`;
  // Cùng một màn báo cáo: phần hành động ở cuối đổi theo vai và trạng thái (đề xuất / trả lời / chỉ xem).
  if (id === "viewReport" || id === "propose" || id === "respond") return `/deals/${dealId}/report${q(as)}`;
  if (id === "receipt") return `/deals/${dealId}/receipt${q(as)}`;
  // Người thuê báo phòng sai và chủ trọ phản đối dùng chung một màn: chụp + AI, hoặc xem bằng chứng + phản đối.
  if (id === "mismatch" || id === "contestMismatch") return `/deals/${dealId}/mismatch${q(as)}`;
  if (id === "viewVotes") return `/jury/${dealId}`;
  return null;
}

function ActionBar({ deal, role, previewAs }: { deal: DealView; role: Role; previewAs?: Role }) {
  const { ready, authenticated, login } = usePrivy();
  const [quickTx, setQuickTx] = useState<QuickTxId | null>(null);
  const [pokeOpen, setPokeOpen] = useState(false);
  const { now } = useCountdown(null);
  const checkOutGrace = useCheckOutGrace();
  const actions = actionsFor(deal, role, now, checkOutGrace);
  const { onchain } = deal;
  const pokeReady = usePokeStage(deal) === "ready";
  const confirming = isConfirmingCheckIn(deal, Date.now());
  const canPoke = pokeReady && !confirming;
  useConfirmCheckIn(deal, confirming && pokeReady);
  const receiptHref = hrefFor("receipt", deal.dealId, previewAs)!;

  // Người thuê tương lai nhìn thấy phòng OPEN: dẫn về màn Chi tiết phòng để gửi cọc.
  const depositLink = onchain.state === "OPEN" && role === "viewer";
  // Người ngoài (bồi thẩm) mở hợp đồng đang tranh chấp: dẫn sang màn Bỏ phiếu (màn đó tự kiểm tra isJuror).
  const juryLink = onchain.state === "DISPUTED" && role === "viewer";
  // Hợp đồng đã chia tiền: người xem ngoài hai bên cũng mở được biên nhận (màn đó chỉ đọc).
  const receiptLink = PAID_STATES.includes(onchain.state) && role === "viewer";

  // Poke xong thì canPoke về false và người ngoài không còn nút nào: thanh ẩn đi, nhưng drawer poke nằm NGOÀI thanh
  // nên vẫn mở để hiện kết quả giao dịch (link Snowtrace, nút Xem biên nhận).
  const showBar = canPoke || actions.length > 0 || depositLink || juryLink || receiptLink;

  let content: React.ReactNode;
  if (!ready) {
    content = <Skeleton className="h-14 w-full rounded-xl" />;
  } else if (!authenticated && !DEALS_MOCK) {
    content = (
      <Button size="lg" className="h-14 w-full text-base" onClick={login}>
        Đăng nhập để thao tác
      </Button>
    );
  } else {
    content = (
      <div className="space-y-2">
        {canPoke && <PokeTrigger onClick={() => setPokeOpen(true)} />}
        {juryLink && (
          <Button asChild size="lg" variant={canPoke ? "outline" : "default"} className="h-14 w-full text-base">
            <Link href={`/jury/${deal.dealId}`}>
              <Gavel /> Xem bằng chứng và bỏ phiếu
            </Link>
          </Button>
        )}
        {depositLink && (
          <Button asChild size="lg" className="h-14 w-full text-base">
            <Link href={`/rooms/${deal.dealId}`}>Xem phòng và gửi cọc</Link>
          </Button>
        )}
        {receiptLink && (
          <Button asChild size="lg" className="h-14 w-full text-base">
            <Link href={receiptHref}>Xem biên nhận</Link>
          </Button>
        )}
        {actions.map((a) => (
          <ActionButton
            key={a.id}
            action={a}
            href={hrefFor(a.id, deal.dealId, previewAs)}
            secondary={canPoke}
            onQuickTx={setQuickTx}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Một vùng hành động duy nhất: thanh đáy trên mobile/tablet, trong cột tóm tắt từ desktop. */}
      {showBar && (
        <div className="min-w-0 lg:col-start-2 lg:row-start-2">
          <ActionArea>{content}</ActionArea>
        </div>
      )}
      {/* Nằm ngoài thanh: giao dịch xong thì nút biến mất (deal đổi trạng thái) nhưng drawer vẫn còn để hiện kết quả. */}
      <QuickTxDrawer deal={deal} id={quickTx} onClose={() => setQuickTx(null)} />
      <PokeDrawer deal={deal} open={pokeOpen} onClose={() => setPokeOpen(false)} receiptHref={receiptHref} />
    </>
  );
}

function ActionButton({
  action,
  href,
  secondary,
  onQuickTx,
}: {
  action: DealAction;
  href: string | null;
  /** true khi đã có nút "Xử lý quá hạn" ở trên: các nút khác lùi xuống nút viền. */
  secondary: boolean;
  onQuickTx: (id: QuickTxId) => void;
}) {
  const quick = isQuickTx(action.id) ? action.id : null;
  const ready = READY.includes(action.id);
  // Hợp đồng đã kết thúc: biên nhận là việc chính của màn, dù bảng nút xếp nó vào nhóm phụ.
  const lead = action.variant === "primary" || action.id === "receipt";
  const variant = action.variant === "danger" ? "outline" : !lead || secondary ? "outline" : "default";
  const big = lead && !secondary;
  const cls = cn(
    "w-full text-base",
    big ? "h-14" : "h-12",
    action.variant === "danger" && "border-destructive/30 text-destructive hover:bg-destructive/5",
  );

  if (ready && href) {
    return (
      <Button asChild size="lg" variant={variant} className={cls}>
        <Link href={href}>{action.label}</Link>
      </Button>
    );
  }

  return (
    <Button
      size="lg"
      variant={variant}
      disabled={!ready}
      onClick={quick ? () => onQuickTx(quick) : undefined}
      className={cls}
    >
      {action.label}
      {!ready && <span className="ml-1 text-xs font-normal opacity-80">· Sắp có</span>}
    </Button>
  );
}

// ------------------------------------------------------------------ phụ

/** Chỉ hiện ở chế độ dữ liệu giả: xem màn như người thuê hoặc chủ trọ. */
function PreviewSwitch({ dealId, current }: { dealId: number | null; current?: Role }) {
  if (dealId === null) return null;
  const opts: { as?: Role; label: string }[] = [
    { as: undefined, label: "Theo ví" },
    { as: "tenant", label: "Người thuê" },
    { as: "landlord", label: "Chủ trọ" },
  ];
  return (
    <nav aria-label="Xem thử theo vai trò (dữ liệu giả)" className="mt-1 flex flex-wrap items-center gap-1 text-xs">
      <span className="mr-1 text-muted-foreground">Dữ liệu giả, xem như:</span>
      {opts.map((o) => (
        <Link
          key={o.label}
          href={o.as ? `/deals/${dealId}?as=${o.as}` : `/deals/${dealId}`}
          replace
          className={cn(
            "inline-flex min-h-11 items-center rounded-full px-3 ring-1 ring-foreground/10",
            current === o.as ? "bg-primary text-primary-foreground" : "bg-card",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

/** Lỗi tải: chưa có dữ liệu thì thay cả màn; đã có dữ liệu cũ thì báo ngay trên nội dung đang hiện. */
function LoadError({ stale, fetching, onRetry }: { stale: boolean; fetching: boolean; onRetry: () => void }) {
  if (stale) {
    return (
      <section
        role="alert"
        className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
      >
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">Chưa cập nhật được hợp đồng</p>
          <p className="text-sm text-foreground/80">Đang hiện lần tải thành công gần nhất. Tải lại trước khi thao tác.</p>
        </div>
        <Button variant="outline" onClick={onRetry} disabled={fetching} className="min-h-11">
          <RefreshCw className="size-4" aria-hidden="true" /> {fetching ? "Đang tải…" : "Tải lại"}
        </Button>
      </section>
    );
  }
  return (
    <div role="alert" className="mt-8 grid place-items-center gap-3 rounded-2xl bg-muted px-6 py-12 text-center">
      <AlertTriangle className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="font-semibold">Không tải được hợp đồng</p>
      <p className="text-sm text-muted-foreground">Kiểm tra mạng rồi thử lại.</p>
      <Button onClick={onRetry} disabled={fetching}>
        {fetching ? "Đang tải…" : "Thử lại"}
      </Button>
    </div>
  );
}

/** Cùng bố cục với màn thật (tóm tắt trước, nội dung sau) để nội dung thay vào không làm nhảy. */
function DetailSkeleton() {
  return (
    <div className="mt-2" aria-busy="true">
      <p role="status" className="sr-only">
        Đang tải hợp đồng…
      </p>
      <div className="mb-6 space-y-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-9 w-4/5 max-w-md" />
        <Skeleton className="h-4 w-3/5 max-w-sm" />
      </div>
      <PageColumns>
        <div className="space-y-6">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </PageColumns>
    </div>
  );
}

function NotFound() {
  return (
    <PageShell size="read">
      <PageHeader href="/home" backLabel="Về trang chủ" />
      <div className="mt-8 grid place-items-center gap-3 rounded-2xl bg-muted px-6 py-12 text-center">
        <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-xl font-bold">Không tìm thấy hợp đồng này</h1>
        <p className="text-sm text-muted-foreground">Đường dẫn có thể bị sai.</p>
        <Button asChild>
          <Link href="/home">Về trang chủ</Link>
        </Button>
      </div>
    </PageShell>
  );
}

/** Người thuê đã gửi ảnh nhận phòng và hạn chủ trọ phản đối đã qua: hợp đồng chỉ còn chờ chuyển sang Đang ở. */
function isConfirmingCheckIn(deal: DealView, now: number): boolean {
  const o = deal.onchain;
  return o.state === "RESERVED" && deal.photoSets.checkin !== null && o.deadline !== null && now > Date.parse(o.deadline);
}

/** Nhờ server (ví keeper) poke một lần để sang Đang ở ngay, rồi tải lại hợp đồng. Bot cron vẫn là đường dự phòng. */
function useConfirmCheckIn(deal: DealView, ready: boolean) {
  const qc = useQueryClient();
  const sent = useRef(false);
  useEffect(() => {
    if (!ready || sent.current) return;
    sent.current = true;
    void fetch(`/api/v1/deals/${deal.dealId}/confirm-checkin`, { method: "POST" })
      .catch(() => null)
      .finally(() => {
        window.setTimeout(() => void qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] }), 4000);
      });
  }, [ready, deal.dealId, qc]);
}
