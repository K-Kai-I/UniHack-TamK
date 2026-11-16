"use client";
// Màn "Chi tiết hợp đồng" (docs/user-flow.md > Danh sách màn hình, P0, GĐ 1–6): trạng thái, đếm ngược deadline,
// nút theo bảng "Nút trên app theo trạng thái" (lib/client/deal-actions.ts), nút "Xử lý quá hạn" khi canPoke.
// Màn này là "nhà" của một hợp đồng: các màn chụp ảnh, đề xuất, trả lời, biên nhận đều mở từ đây.
import { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Gavel, Hourglass, Loader2, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { RoomCover } from "@/components/room-cover";
import { TxStatus } from "@/components/tx-status";
import { WalletChip } from "@/components/wallet-chip";
import { addresses, escrowAbi } from "@/lib/chain";
import {
  actionsFor,
  deadlineInfo,
  roleOf,
  stepIndex,
  STEPS,
  type ActionId,
  type DealAction,
  type Role,
} from "@/lib/client/deal-actions";
import { DEALS_MOCK, fetchDealView, NotFoundError, type DealView, type PhotoSetView } from "@/lib/client/deals-data";
import { formatDate } from "@/lib/client/date";
import { amountToVnd, formatToken, formatVnd } from "@/lib/client/money";
import { formatDuration, useCountdown } from "@/lib/client/use-countdown";
import { useTx } from "@/lib/client/use-tx";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import type { Amount } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<Role, string> = { tenant: "Người thuê", landlord: "Chủ trọ", viewer: "Người xem" };

export function DealDetail({ dealId, previewAs }: { dealId: string; previewAs?: Role }) {
  const id = /^\d+$/.test(dealId) ? Number(dealId) : null;
  const { address } = useAccount();
  const { data, isPending, error, refetch } = useQuery({
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
      <main className="mx-auto min-h-dvh max-w-md px-5 pb-40">
        <PageHeader href="/" backLabel="Về trang chủ" title={id !== null ? `Hợp đồng #${id}` : "Hợp đồng"} />
        {DEALS_MOCK && <PreviewSwitch dealId={id} current={previewAs} />}
        {isPending && <DetailSkeleton />}
        {error && !isPending && (
          <div className="mt-8 grid place-items-center gap-3 rounded-2xl bg-muted px-6 py-12 text-center">
            <p className="font-semibold">Không tải được hợp đồng</p>
            <p className="text-sm text-muted-foreground">Kiểm tra mạng rồi thử lại.</p>
            <Button onClick={() => refetch()}>Thử lại</Button>
          </div>
        )}
        {data && role && <DetailBody deal={data} role={role} onExpire={() => refetch()} />}
      </main>
      {data && role && <ActionBar deal={data} role={role} previewAs={previewAs} />}
    </>
  );
}

// ------------------------------------------------------------------ nội dung

function DetailBody({ deal, role, onExpire }: { deal: DealView; role: Role; onExpire: () => void }) {
  const { terms, onchain } = deal;
  const rate = useVndRate();
  const vnd = (a: Amount) => formatVnd(amountToVnd(a, rate));

  return (
    <div className="mt-2 space-y-7">
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <DealStatusBadge state={onchain.state} />
          <span className="text-sm text-muted-foreground">Bạn là {ROLE_LABEL[role].toLowerCase()}</span>
        </div>
        <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-balance text-primary">
          {terms.room.title}
        </h1>
        <p className="text-muted-foreground">{terms.room.address}</p>
      </section>

      <Stepper deal={deal} />
      <DeadlineCard deal={deal} onExpire={onExpire} />
      <ProposalCard deal={deal} role={role} vnd={vnd} />

      <section aria-labelledby="money" className="space-y-3">
        <h2 id="money" className="text-lg font-bold">
          Tiền cọc trong contract
        </h2>
        <dl className="divide-y rounded-2xl bg-card ring-1 ring-foreground/10">
          <Row label="Tiền cọc" value={vnd(onchain.deposit)} sub={formatToken(onchain.deposit)} strong />
          <Row label="Phí giữ chỗ" value={vnd(onchain.reserveFee)} sub={formatToken(onchain.reserveFee)} />
          <Row label="Dọn vào" value={formatDate(terms.dates.moveInDate)} />
          <Row label="Hết hạn thuê" value={formatDate(terms.dates.leaseEnd)} />
          {onchain.yieldOn && <Row label="Sinh lãi" value="Đang bật" />}
        </dl>
      </section>

      <section aria-labelledby="parties" className="space-y-3">
        <h2 id="parties" className="text-lg font-bold">
          Hai bên
        </h2>
        <dl className="divide-y rounded-2xl bg-card ring-1 ring-foreground/10">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="text-muted-foreground">Chủ trọ</dt>
            <dd>
              <WalletChip address={onchain.landlord} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="text-muted-foreground">Người thuê</dt>
            <dd>
              {onchain.tenant ? (
                <WalletChip address={onchain.tenant} />
              ) : (
                <span className="text-sm text-muted-foreground">Chưa có ai cọc</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <PhotoSetSection title="Ảnh nhận phòng" set={deal.photoSets.checkin} deal={deal} />
      <PhotoSetSection title="Ảnh trả phòng" set={deal.photoSets.checkout} deal={deal} />

      <p className="text-sm text-muted-foreground">
        Trạng thái đọc trực tiếp từ smart contract. Không ai, kể cả app, tự rút được tiền cọc.
      </p>
    </div>
  );
}

/** Thanh 5 bước: xong (dấu tick), đang làm (tô đậm), chưa tới (mờ). */
function Stepper({ deal }: { deal: DealView }) {
  const current = stepIndex(deal);
  if (current === null) return null;
  return (
    <ol aria-label="Tiến trình hợp đồng" className="grid grid-cols-5 gap-1.5">
      {STEPS.map((name, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={name} className="space-y-1.5" aria-current={active ? "step" : undefined}>
            <div
              className={cn(
                "h-1.5 rounded-full",
                done ? "bg-success" : active ? "bg-primary" : "bg-muted",
              )}
            />
            <p
              className={cn(
                "flex items-center gap-0.5 text-[11px] leading-tight",
                active ? "font-semibold text-primary" : done ? "text-foreground/70" : "text-muted-foreground",
              )}
            >
              {done && <Check className="size-3 shrink-0 text-success" />}
              {name}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/** Đếm ngược deadline + nói rõ hết hạn thì chuyện gì xảy ra (ai im lặng thì người đó chịu). */
function DeadlineCard({ deal, onExpire }: { deal: DealView; onExpire: () => void }) {
  const { onchain } = deal;
  const info = deadlineInfo(onchain.state, deal.photoSets.checkin !== null);
  const { passed, msLeft } = useCountdown(onchain.deadline, onExpire);

  if (!info || !onchain.deadline || msLeft === null) {
    if (onchain.state === "ACTIVE") {
      return (
        <InfoBox icon={<Clock className="size-5" />} title="Đang thuê">
          Hết hạn thuê ngày {formatDate(deal.terms.dates.leaseEnd)}. Người thuê bấm Trả phòng khi dọn đi.
        </InfoBox>
      );
    }
    return null;
  }

  return (
    <section
      aria-label="Hạn chót"
      className={cn(
        "space-y-1 rounded-2xl p-4 ring-1",
        passed ? "bg-destructive/5 ring-destructive/20" : "bg-warning/10 ring-warning/30",
      )}
    >
      <p className="flex items-center gap-2 text-sm font-medium text-foreground/80">
        <Hourglass className="size-4" /> {info.waiting}
      </p>
      <p
        className={cn("text-3xl font-extrabold tabular-nums", passed ? "text-destructive" : "text-primary")}
        aria-live="off"
      >
        {passed ? "Đã quá hạn" : formatDuration(msLeft)}
      </p>
      <p className="text-sm text-muted-foreground">
        {passed ? "Ai cũng bấm được “Xử lý quá hạn”. " : "Hết hạn: "}
        {info.onTimeout}
      </p>
    </section>
  );
}

/** Con số chủ trọ đề xuất, số AI ký con dấu, và (nếu kháng nghị) số người thuê đưa ra + phiếu. */
function ProposalCard({ deal, role, vnd }: { deal: DealView; role: Role; vnd: (a: Amount) => string }) {
  const { onchain } = deal;
  const show = ["PROPOSED", "DISPUTED", "SETTLED"].includes(onchain.state) && onchain.disputeKind !== "MISMATCH";
  if (!show || onchain.proposedAmount === "0") return null;

  const C = BigInt(onchain.deposit);
  const D = BigInt(onchain.proposedAmount); // bigint: tiền không đi qua number (AGENTS.md luật 8)
  const disputed = onchain.state === "DISPUTED";

  return (
    <section aria-labelledby="proposal" className="space-y-3">
      <h2 id="proposal" className="text-lg font-bold">
        Mức trừ
      </h2>
      <dl className="divide-y rounded-2xl bg-card ring-1 ring-foreground/10">
        <Row label="Chủ trọ đề xuất" value={vnd(onchain.proposedAmount)} strong />
        {onchain.hasAiSeal && <Row label="AI tính (có con dấu)" value={vnd(onchain.aiAmount)} />}
        {disputed && <Row label="Người thuê đưa ra" value={vnd(onchain.counterAmount)} />}
        {!disputed && (
          <Row
            label={role === "tenant" ? "Bạn nhận lại" : "Người thuê nhận lại"}
            value={vnd((C - D).toString())}
            sub={onchain.yieldGross !== "0" ? "chưa tính phần lãi" : undefined}
          />
        )}
      </dl>
      {disputed && (
        <InfoBox icon={<Gavel className="size-5" />} title="Phiếu bồi thẩm (bên nào đủ 2 phiếu thì thắng)">
          Chủ trọ {onchain.votesLandlord} phiếu · Người thuê {onchain.votesTenant} phiếu
          {onchain.hasAiSeal && ". Đã tính phiếu của AI."}
        </InfoBox>
      )}
    </section>
  );
}

function PhotoSetSection({ title, set, deal }: { title: string; set: PhotoSetView | null; deal: DealView }) {
  if (!set) return null;
  const name = (pid: string) => deal.terms.positions.find((p) => p.id === pid)?.name ?? pid;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <ul className="grid grid-cols-3 gap-2">
        {set.items.map((it) => (
          <li key={it.positionId} className="space-y-1">
            <div className="aspect-square overflow-hidden rounded-xl ring-1 ring-foreground/10">
              <RoomCover url={it.url || null} alt={`${title}: ${name(it.positionId)}`} />
            </div>
            <p className="truncate text-xs text-muted-foreground">{name(it.positionId)}</p>
          </li>
        ))}
      </ul>
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
  return null;
}

function ActionBar({ deal, role, previewAs }: { deal: DealView; role: Role; previewAs?: Role }) {
  const { ready, authenticated, login } = usePrivy();
  const [txKind, setTxKind] = useState<"poke" | "cancel" | null>(null);
  const { now } = useCountdown(null);
  const actions = actionsFor(deal, role, now);
  const { onchain } = deal;

  // Người thuê tương lai nhìn thấy phòng OPEN: dẫn về màn Chi tiết phòng để gửi cọc.
  const depositLink = onchain.state === "OPEN" && role === "viewer";

  if (!onchain.canPoke && actions.length === 0 && !depositLink) return null;

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
        {onchain.canPoke && (
          <Button size="lg" className="h-14 w-full text-base" onClick={() => setTxKind("poke")}>
            Xử lý quá hạn
          </Button>
        )}
        {depositLink && (
          <Button asChild size="lg" className="h-14 w-full text-base">
            <Link href={`/rooms/${deal.dealId}`}>Xem phòng và gửi cọc</Link>
          </Button>
        )}
        {actions.map((a) => (
          <ActionButton
            key={a.id}
            action={a}
            href={hrefFor(a.id, deal.dealId, previewAs)}
            secondary={onchain.canPoke}
            onCancel={() => setTxKind("cancel")}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto max-w-md px-5 pt-3">{content}</div>
      <TxDrawer deal={deal} kind={txKind} onClose={() => setTxKind(null)} />
    </div>
  );
}

function ActionButton({
  action,
  href,
  secondary,
  onCancel,
}: {
  action: DealAction;
  href: string | null;
  /** true khi đã có nút "Xử lý quá hạn" ở trên: các nút khác lùi xuống nút viền. */
  secondary: boolean;
  onCancel: () => void;
}) {
  const ready = READY.includes(action.id);
  const variant =
    action.variant === "danger" ? "outline" : action.variant === "secondary" || secondary ? "outline" : "default";
  const big = action.variant === "primary" && !secondary;
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
      onClick={action.id === "cancel" ? onCancel : undefined}
      className={cls}
    >
      {action.label}
      {!ready && <span className="ml-1 text-xs font-normal opacity-80">· Sắp có</span>}
    </Button>
  );
}

/** Xác nhận rồi gửi `poke(id)` hoặc `cancelDeal(id)`. Hiện 3 trạng thái giao dịch, xong thì tải lại deal. */
function TxDrawer({ deal, kind, onClose }: { deal: DealView; kind: "poke" | "cancel" | null; onClose: () => void }) {
  const tx = useTx();
  const qc = useQueryClient();
  const busy = tx.state.phase === "signing" || tx.state.phase === "pending";
  const done = tx.state.phase === "success";
  const info = deadlineInfo(deal.onchain.state, deal.photoSets.checkin !== null);

  const copy =
    kind === "cancel"
      ? {
          title: "Gỡ phòng này?",
          desc: "Phòng chưa có ai cọc. Gỡ xong, phòng không hiện trong danh sách nữa và không mở lại được.",
          confirm: "Gỡ phòng",
          done: "Đã gỡ phòng",
        }
      : {
          title: "Xử lý quá hạn",
          desc: `Hạn chót đã qua. ${info?.onTimeout ?? ""} Ai bấm cũng được, tiền vẫn chỉ đi theo contract.`,
          confirm: "Xử lý ngay",
          done: "Đã xử lý quá hạn",
        };

  async function submit() {
    const receipt = await tx.run({
      address: addresses.escrow,
      abi: escrowAbi,
      functionName: kind === "cancel" ? "cancelDeal" : "poke",
      args: [BigInt(deal.dealId)],
    });
    if (receipt) await qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] });
  }

  function change(open: boolean) {
    if (open || busy) return; // đang ký/chờ chuỗi: không cho đóng để khỏi mất dấu giao dịch
    onClose();
    tx.reset();
  }

  return (
    <Drawer open={kind !== null} onOpenChange={change}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="text-xl font-extrabold text-primary">{copy.title}</DrawerTitle>
            <DrawerDescription>{copy.desc}</DrawerDescription>
          </DrawerHeader>
          {tx.state.phase !== "idle" && (
            <div className="mb-3">
              <TxStatus state={tx.state} doneText={copy.done} />
            </div>
          )}
          {done ? (
            <Button size="lg" className="h-14 w-full text-base" onClick={() => change(false)}>
              Xong
            </Button>
          ) : (
            <Button
              size="lg"
              variant={kind === "cancel" ? "destructive" : "default"}
              className="h-14 w-full text-base"
              disabled={busy}
              onClick={submit}
            >
              {busy && <Loader2 className="animate-spin" />}
              {tx.state.phase === "error" ? "Thử lại" : copy.confirm}
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
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
    <nav aria-label="Xem thử theo vai trò (dữ liệu giả)" className="mt-1 flex items-center gap-1 text-xs">
      <span className="mr-1 text-muted-foreground">Dữ liệu giả, xem như:</span>
      {opts.map((o) => (
        <Link
          key={o.label}
          href={o.as ? `/deals/${dealId}?as=${o.as}` : `/deals/${dealId}`}
          replace
          className={cn(
            "rounded-full px-2.5 py-1 ring-1 ring-foreground/10",
            current === o.as ? "bg-primary text-primary-foreground" : "bg-card",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

function InfoBox({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-secondary/60 p-4 text-sm">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="space-y-0.5">
        <p className="font-semibold text-primary">{title}</p>
        <p className="text-foreground/80">{children}</p>
      </div>
    </div>
  );
}

function Row({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">
        <span className={strong ? "text-xl font-extrabold text-primary" : "font-semibold"}>{value}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mt-4 space-y-6" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}

function NotFound() {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-5">
      <PageHeader href="/" backLabel="Về trang chủ" />
      <div className="mt-8 grid place-items-center gap-3 rounded-2xl bg-muted px-6 py-12 text-center">
        <SearchX className="size-8 text-muted-foreground" />
        <p className="font-semibold">Không tìm thấy hợp đồng này</p>
        <p className="text-sm text-muted-foreground">Đường dẫn có thể bị sai.</p>
        <Button asChild>
          <Link href="/">Về trang chủ</Link>
        </Button>
      </div>
    </main>
  );
}
