"use client";
// Màn "Biên nhận cuối" (cả hai bên, docs/user-flow.md GĐ6): ai nhận bao nhiêu, lấy từ event `Paid` của contract,
// kèm link Snowtrace của giao dịch chia tiền và lịch sử các giao dịch của hợp đồng.
//
// Tách hai lớp: DealReceipt giữ truy vấn (hợp đồng, event Paid trên chuỗi, ví) còn DealReceiptView chỉ trình bày,
// để /dev/receipt xem thử bằng dữ liệu giả. Số tiền chỉ lấy từ event Paid; màn này KHÔNG tính lại kết quả từ
// đề xuất/AI (task 17). Các con số đề xuất chỉ để đối chiếu, nhãn rõ "không phải số đã chia".
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, ExternalLink, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionArea } from "@/components/action-area";
import { ChainHistory, explorerAddressUrl } from "@/components/chain-proof";
import { Blocked, InfoBox, Row, Rows } from "@/components/deal-bits";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { addresses, chain, explorerTxUrl } from "@/lib/chain";
import { PAID_STATES, roleOf, type Role } from "@/lib/client/deal-actions";
import { DEALS_MOCK, fetchDealView, NotFoundError, type DealView } from "@/lib/client/deals-data";
import { formatDateTime } from "@/lib/client/date";
import { amountToVnd, formatToken, formatVnd, shortAddress } from "@/lib/client/money";
import { fetchPaid, type Outcome, type PaidInfo } from "@/lib/client/receipt";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import type { Hash, IsoTime } from "@/lib/types";

/** Vì sao chia như vậy (bảng Outcome trong docs/contract-spec.md). Chỉ nêu điều contract bảo đảm. */
const OUTCOME_TEXT: Record<Outcome, { title: string; text: string }> = {
  NORMAL: {
    title: "Chia theo mức trừ đã chốt",
    text: "Chủ trọ nhận mức trừ đã chốt, người thuê nhận phần cọc còn lại.",
  },
  LANDLORD_SILENT: {
    title: "Chủ trọ không đề xuất mức trừ đúng hạn",
    text: "Người thuê nhận lại đủ tiền cọc.",
  },
  ABANDONED: {
    title: "Người thuê không xác nhận còn ở sau khi bị báo bỏ đi",
    text: "Chủ trọ nhận lại tiền cọc.",
  },
  NO_SHOW: {
    title: "Người thuê không nhận phòng, hoặc thua tranh chấp phòng sai mô tả",
    text: "Người thuê nhận lại cọc trừ phí giữ chỗ; chủ trọ giữ phí giữ chỗ.",
  },
  MISMATCH: {
    title: "Phòng sai mô tả",
    text: "Người thuê nhận lại đủ tiền cọc; chủ trọ không giữ khoản nào.",
  },
};

type PayTx = { hash: Hash; at: IsoTime | null };

/** Trạng thái đọc số tiền từ giao dịch chia tiền. */
export type PaidStatus =
  | { kind: "ready"; paid: PaidInfo }
  | { kind: "loading"; tx: PayTx }
  | { kind: "syncing" } // server chưa thấy event Paid
  | { kind: "error"; tx: PayTx } // không gọi được RPC
  | { kind: "unreadable"; tx: PayTx }; // đọc được giao dịch nhưng không thấy log Paid của hợp đồng này

export function DealReceipt({ dealId, previewAs }: { dealId: string; previewAs?: Role }) {
  const id = /^\d+$/.test(dealId) ? Number(dealId) : null;
  const { address } = useAccount();
  const client = usePublicClient({ chainId: chain.id });
  const back = id !== null ? `/deals/${id}${previewAs ? `?as=${previewAs}` : ""}` : "/";
  const rate = useVndRate();

  const deal = useQuery({
    queryKey: ["deal-view", id],
    queryFn: () => fetchDealView(id!),
    enabled: id !== null,
    retry: (n, e) => !(e instanceof NotFoundError) && n < 2,
    // Vừa chia tiền xong mà server chưa kịp đọc event Paid: hỏi lại tới khi có.
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && PAID_STATES.includes(d.onchain.state) && !d.history.some((h) => h.event === "Paid") ? 4000 : false;
    },
  });
  const d = deal.data;
  const paidRow = d?.history.findLast((h) => h.event === "Paid");
  const paidTx = paidRow?.txHash;
  const paid = useQuery({
    queryKey: ["paid", id, paidTx],
    queryFn: () => fetchPaid(client, d!),
    enabled: !!d && !!paidTx,
    staleTime: Infinity, // event trên chuỗi không đổi
  });

  if (id === null || deal.error instanceof NotFoundError) {
    return <Blocked back="/" header="Biên nhận" title="Không tìm thấy hợp đồng này" text="Đường dẫn có thể bị sai." />;
  }
  if (deal.error && !d) {
    return (
      <Blocked back={back} header="Biên nhận" title="Không tải được hợp đồng" text="Kiểm tra mạng rồi thử lại.">
        <Button onClick={() => deal.refetch()}>Thử lại</Button>
      </Blocked>
    );
  }
  if (!d) return <ReceiptSkeleton back={back} />;

  const tx = paidRow ? { hash: paidRow.txHash, at: paidRow.at } : null;
  const status: PaidStatus = paid.data
    ? { kind: "ready", paid: paid.data }
    : !tx
      ? { kind: "syncing" }
      : paid.error
        ? { kind: "error", tx }
        : paid.isPending
          ? { kind: "loading", tx }
          : { kind: "unreadable", tx };

  return (
    <>
      <NetworkBanner />
      <DealReceiptView
        deal={d}
        status={status}
        role={DEALS_MOCK && previewAs ? previewAs : roleOf(d, address)}
        back={back}
        rate={rate}
        staleError={!!deal.error}
        onReloadDeal={() => deal.refetch()}
        onRetryPaid={() => paid.refetch()}
      />
    </>
  );
}

function ReceiptSkeleton({ back }: { back: string }) {
  return (
    <PageShell size="read" aria-busy="true" aria-label="Đang tải biên nhận">
      <PageHeader href={back} backLabel="Về hợp đồng" title="Biên nhận" />
      <p role="status" className="sr-only">
        Đang tải biên nhận…
      </p>
      <div className="mt-4 space-y-5">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-52 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    </PageShell>
  );
}

export function DealReceiptView({
  deal,
  status,
  role,
  back,
  rate,
  staleError = false,
  onReloadDeal,
  onRetryPaid,
}: {
  deal: DealView;
  status: PaidStatus;
  role: Role;
  back: string;
  rate: number;
  /** Có dữ liệu cũ nhưng lần tải lại vừa lỗi. */
  staleError?: boolean;
  onReloadDeal: () => void;
  onRetryPaid: () => void;
}) {
  const { onchain, terms } = deal;
  const refunded = onchain.state === "REFUNDED";

  if (!PAID_STATES.includes(onchain.state)) {
    return (
      <Blocked
        back={back}
        header="Biên nhận"
        title="Chưa chia tiền"
        text="Biên nhận có sau khi contract chia tiền cọc cho hai bên."
      />
    );
  }

  const paid = status.kind === "ready" ? status.paid : null;
  const tx = status.kind === "ready" ? { hash: status.paid.txHash, at: status.paid.at } : status.kind === "syncing" ? null : status.tx;
  const mine = paid && role !== "viewer" ? (role === "tenant" ? paid.toTenant : paid.toLandlord) : null;
  const vnd = (a: bigint) => formatVnd(amountToVnd(a, rate));

  return (
    <PageShell size="read">
      <PageHeader href={back} backLabel="Về hợp đồng" title="Biên nhận" />
      <div className="mt-4 space-y-8">
        {staleError && (
          <InfoBox icon={<CircleAlert className="size-5" />} tone="warning" title="Chưa cập nhật được hợp đồng">
            <p>Đang hiện dữ liệu đã tải trước đó.</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={onReloadDeal}>
              Tải lại
            </Button>
          </InfoBox>
        )}

        <section aria-labelledby="receipt-title" className="space-y-3">
          <div className="flex items-start gap-3">
            {refunded ? (
              <Undo2 className="mt-1 size-7 shrink-0 text-success" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mt-1 size-7 shrink-0 text-success" strokeWidth={1.75} aria-hidden="true" />
            )}
            <div className="min-w-0">
              <h1 id="receipt-title" className="text-2xl font-extrabold tracking-tight text-primary">
                {refunded ? "Đã hoàn tiền cọc" : "Đã chia tiền cọc"}
              </h1>
              <p className="mt-1 break-words font-semibold">{terms.room.title}</p>
              <p className="break-words text-sm text-muted-foreground">{terms.room.address}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Hợp đồng #{deal.dealId}
                {tx?.at && ` · chia tiền lúc ${formatDateTime(tx.at)}`}
              </p>
            </div>
          </div>
          {mine !== null && (
            <div className="rounded-2xl bg-secondary/60 px-5 py-4">
              <p className="text-sm text-muted-foreground">{role === "tenant" ? "Bạn đã nhận lại" : "Bạn đã nhận"}</p>
              <p className="text-3xl font-extrabold tabular-nums break-words text-primary">{vnd(mine)}</p>
              <p className="text-sm text-muted-foreground tabular-nums">{formatToken(mine)}</p>
            </div>
          )}
        </section>

        <PaidSection deal={deal} status={status} role={role} rate={rate} onRetryPaid={onRetryPaid} />

        {paid && <WhySection deal={deal} paid={paid} rate={rate} />}

        {tx && <TxLink tx={tx} />}

        <HistorySection deal={deal} />

        <section aria-labelledby="receipt-note" className="space-y-2 text-sm text-muted-foreground">
          <h2 id="receipt-note" className="sr-only">
            Ghi chú
          </h2>
          <p className="max-w-[70ch]">
            Số tiền đọc từ sự kiện <code className="font-mono">Paid</code> của smart contract trên Avalanche Fuji, không
            lấy từ máy chủ của app. Quy đổi ₫ theo tỉ giá hiển thị 1 mUSDC = {formatVnd(Math.round(rate))}; số trên
            chuỗi tính bằng mUSDC.
          </p>
          <p className="max-w-[70ch]">mUSDC là token thử nghiệm trên mạng thử, không phải tiền thật.</p>
          {DEALS_MOCK && <p>Dữ liệu giả: link Snowtrace không có thật.</p>}
        </section>
      </div>
      <ActionArea>
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link href={back}>Về hợp đồng</Link>
        </Button>
      </ActionArea>
    </PageShell>
  );
}

function PaidSection({
  deal,
  status,
  role,
  rate,
  onRetryPaid,
}: {
  deal: DealView;
  status: PaidStatus;
  role: Role;
  rate: number;
  onRetryPaid: () => void;
}) {
  const { onchain } = deal;
  const vnd = (a: bigint) => formatVnd(amountToVnd(a, rate));
  const you = (r: Role) => (role === r ? " (bạn)" : "");
  const party = (label: string, r: Role, addr: string | null) => (
    <span>
      {label}
      {you(r)}
      {addr && <span className="block font-mono text-xs">{shortAddress(addr, 8, 6)}</span>}
    </span>
  );

  if (status.kind === "ready") {
    const { paid } = status;
    const total = paid.toTenant + paid.toLandlord + paid.fee;
    // Contract-spec: người thuê + chủ trọ + phí = C + G (cọc + lãi). Chỉ khẳng định khi khớp thật.
    const expected = BigInt(onchain.deposit) + BigInt(onchain.yieldGross);
    const matches = total === expected;
    return (
      <section aria-labelledby="paid" className="space-y-3">
        <h2 id="paid" className="text-lg font-bold">
          Ai nhận bao nhiêu
        </h2>
        <Rows>
          <Row
            label={party("Người thuê", "tenant", onchain.tenant)}
            value={vnd(paid.toTenant)}
            sub={formatToken(paid.toTenant)}
            strong
            tone="success"
          />
          <Row label={party("Chủ trọ", "landlord", onchain.landlord)} value={vnd(paid.toLandlord)} sub={formatToken(paid.toLandlord)} strong />
          {paid.fee > 0n && (
            <Row label="Phí nền tảng (trên phần lãi)" value={vnd(paid.fee)} sub={formatToken(paid.fee)} />
          )}
          <Row label="Tổng đã chia" value={vnd(total)} sub={formatToken(total)} />
        </Rows>
        {matches ? (
          <p className="text-sm text-muted-foreground">
            Tổng khớp tiền cọc{BigInt(onchain.yieldGross) > 0n ? " và lãi" : ""} ghi trong contract.
          </p>
        ) : (
          <InfoBox icon={<CircleAlert className="size-5" />} tone="warning" title="Tổng chưa khớp số ghi trong contract">
            <p>Mở giao dịch trên Snowtrace để đối chiếu; số ở trên là số contract đã chia.</p>
          </InfoBox>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="paid" className="space-y-3">
      <h2 id="paid" className="text-lg font-bold">
        Ai nhận bao nhiêu
      </h2>
      {status.kind === "loading" ? (
        <div aria-busy="true">
          <p role="status" className="sr-only">
            Đang đọc giao dịch chia tiền…
          </p>
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : status.kind === "error" ? (
        <InfoBox icon={<CircleAlert className="size-5" />} tone="warning" title="Chưa đọc được giao dịch chia tiền">
          <p>Không kết nối được mạng Fuji. Số tiền chưa hiện vì app không lấy từ nơi nào khác ngoài chuỗi.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={onRetryPaid}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Thử lại
          </Button>
        </InfoBox>
      ) : status.kind === "unreadable" ? (
        <InfoBox icon={<CircleAlert className="size-5" />} tone="warning" title="Không thấy sự kiện chia tiền trong giao dịch này">
          <p>Mở giao dịch trên Snowtrace bên dưới để tự kiểm tra, hoặc thử đọc lại.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={onRetryPaid}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Đọc lại
          </Button>
        </InfoBox>
      ) : (
        <InfoBox icon={<Loader2 className="size-5 animate-spin" />} title="Đang đồng bộ giao dịch chia tiền…">
          <p role="status">Máy chủ đang đọc sự kiện từ chuỗi. Màn này tự cập nhật sau vài giây.</p>
        </InfoBox>
      )}
    </section>
  );
}

/** Con đường dẫn tới kết quả: chỉ khẳng định điều lịch sử trên chuỗi cho thấy. */
function pathText(deal: DealView, paid: PaidInfo): string | null {
  if (paid.outcome !== "NORMAL") return null;
  const events = new Set(deal.history.map((h) => h.event));
  if (events.has("DisputeOpened")) return "Người thuê kháng nghị, bồi thẩm đã phân xử mức trừ.";
  if (events.has("Proposed")) return "Không có kháng nghị: người thuê đồng ý hoặc hết hạn kháng nghị.";
  return null;
}

function WhySection({ deal, paid, rate }: { deal: DealView; paid: PaidInfo; rate: number }) {
  const { onchain } = deal;
  const vnd = (a: bigint) => formatVnd(amountToVnd(a, rate));
  const copy = OUTCOME_TEXT[paid.outcome];
  const path = pathText(deal, paid);
  const showFigures = paid.outcome === "NORMAL" && onchain.proposedAmount !== "0";
  return (
    <section aria-labelledby="why" className="space-y-3">
      <h2 id="why" className="text-lg font-bold">
        Vì sao chia như vậy
      </h2>
      <div className="max-w-[70ch] space-y-1">
        <p className="font-semibold text-primary">{copy.title}</p>
        <p className="text-foreground/80">{copy.text}</p>
        {path && <p className="text-foreground/80">{path}</p>}
      </div>
      {showFigures && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Các con số trong quá trình, để đối chiếu. Số đã chia là số ở trên.</p>
          <Rows>
            <Row label="Chủ trọ đề xuất trừ" value={vnd(BigInt(onchain.proposedAmount))} />
            {onchain.hasAiSeal && <Row label="AI tính (có con dấu)" value={vnd(BigInt(onchain.aiAmount))} />}
            {onchain.counterAmount !== "0" && <Row label="Người thuê đưa ra" value={vnd(BigInt(onchain.counterAmount))} />}
          </Rows>
        </div>
      )}
    </section>
  );
}

function TxLink({ tx }: { tx: PayTx }) {
  return (
    <section aria-labelledby="verify" className="space-y-3">
      <h2 id="verify" className="text-lg font-bold">
        Tự kiểm chứng
      </h2>
      <a
        href={explorerTxUrl + tx.hash}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10 transition-colors hover:bg-secondary/60"
      >
        <span className="min-w-0">
          <span className="block font-semibold text-primary">Xem giao dịch chia tiền trên Snowtrace</span>
          <span className="block break-all font-mono text-xs text-muted-foreground">{shortAddress(tx.hash, 10, 6)}</span>
        </span>
        <ExternalLink className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="sr-only">(mở tab mới)</span>
      </a>
      <a
        href={explorerAddressUrl + addresses.escrow}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm text-primary underline-offset-4 hover:underline"
      >
        <span className="min-w-0">
          Contract giữ cọc <span className="font-mono text-xs text-muted-foreground">{shortAddress(addresses.escrow, 8, 6)}</span>
        </span>
        <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
        <span className="sr-only">(mở tab mới)</span>
      </a>
    </section>
  );
}

function HistorySection({ deal }: { deal: DealView }) {
  if (deal.history.length === 0) return null;
  return (
    <section aria-labelledby="history" className="space-y-3">
      <h2 id="history" className="text-lg font-bold">
        Các bước đã ghi trên chuỗi
      </h2>
      <ChainHistory deal={deal} />
    </section>
  );
}
