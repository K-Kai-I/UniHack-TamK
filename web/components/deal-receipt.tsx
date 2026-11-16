"use client";
// Màn "Biên nhận cuối" (cả hai bên, docs/user-flow.md GĐ6): ai nhận bao nhiêu, lấy từ event `Paid` của contract,
// kèm link Snowtrace của giao dịch chia tiền và lịch sử các giao dịch của hợp đồng.
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChainHistory } from "@/components/chain-proof";
import { Blocked, InfoBox, Row, Rows } from "@/components/deal-bits";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { chain, explorerTxUrl } from "@/lib/chain";
import { PAID_STATES, roleOf, type Role } from "@/lib/client/deal-actions";
import { DEALS_MOCK, fetchDealView, NotFoundError, type DealView } from "@/lib/client/deals-data";
import { formatDateTime } from "@/lib/client/date";
import { amountToVnd, formatToken, formatVnd, shortAddress } from "@/lib/client/money";
import { fetchPaid, type Outcome, type PaidInfo } from "@/lib/client/receipt";
import { useVndRate } from "@/lib/client/use-vnd-rate";

/** Vì sao chia như vậy (bảng Outcome trong docs/contract-spec.md). */
const OUTCOME_TEXT: Record<Outcome, string> = {
  NORMAL: "Chia theo mức trừ đã chốt.",
  NO_SHOW: "Người thuê không gửi ảnh nhận phòng đúng hạn: hoàn cọc, chủ trọ giữ phí giữ chỗ.",
  MISMATCH: "Phòng sai mô tả: người thuê được hoàn đủ cọc.",
  ABANDONED: "Người thuê bỏ đi không trả phòng: chủ trọ nhận phần lớn tiền cọc.",
  LANDLORD_SILENT: "Chủ trọ không đề xuất mức trừ đúng hạn: người thuê nhận lại đủ cọc.",
};

export function DealReceipt({ dealId, previewAs }: { dealId: string; previewAs?: Role }) {
  const id = /^\d+$/.test(dealId) ? Number(dealId) : null;
  const { address } = useAccount();
  const client = usePublicClient({ chainId: chain.id });
  const back = id !== null ? `/deals/${id}${previewAs ? `?as=${previewAs}` : ""}` : "/";

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
  const paidTx = d?.history.findLast((h) => h.event === "Paid")?.txHash;
  const paid = useQuery({
    queryKey: ["paid", id, paidTx],
    queryFn: () => fetchPaid(client, d!),
    enabled: !!d && !!paidTx,
    staleTime: Infinity, // event trên chuỗi không đổi
  });

  if (id === null || deal.error instanceof NotFoundError) {
    return <Blocked back="/" header="Biên nhận" title="Không tìm thấy hợp đồng này" text="Đường dẫn có thể bị sai." />;
  }
  if (deal.error && !deal.isPending) {
    return (
      <Blocked back={back} header="Biên nhận" title="Không tải được hợp đồng" text="Kiểm tra mạng rồi thử lại.">
        <Button onClick={() => deal.refetch()}>Thử lại</Button>
      </Blocked>
    );
  }
  if (!d) {
    return (
      <main className="mx-auto min-h-dvh max-w-md space-y-5 px-5" aria-busy="true">
        <PageHeader href={back} backLabel="Về hợp đồng" title="Biên nhận" />
        <Skeleton className="mx-auto size-16 rounded-full" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </main>
    );
  }
  if (!PAID_STATES.includes(d.onchain.state)) {
    return (
      <Blocked
        back={back}
        header="Biên nhận"
        title="Chưa chia tiền"
        text="Biên nhận có sau khi contract chia tiền cọc cho hai bên."
      />
    );
  }

  const role: Role = DEALS_MOCK && previewAs ? previewAs : roleOf(d, address);

  return (
    <>
      <NetworkBanner />
      <main className="mx-auto min-h-dvh max-w-md px-5 pb-16">
        <PageHeader href={back} backLabel="Về hợp đồng" title="Biên nhận" />
        <div className="mt-4 space-y-7">
          <section className="grid place-items-center gap-2 text-center">
            <CheckCircle2 className="size-14 text-success" strokeWidth={1.75} />
            <h1 className="text-2xl font-extrabold tracking-tight text-primary">Đã chia tiền cọc</h1>
            <p className="text-muted-foreground">
              {d.terms.room.title} · Hợp đồng #{d.dealId}
            </p>
          </section>

          {paid.data ? (
            <PaidBlock deal={d} paid={paid.data} role={role} />
          ) : paid.error ? (
            <InfoBox icon={<Loader2 className="size-5" />} tone="warning" title="Chưa đọc được giao dịch chia tiền">
              <p>Không kết nối được mạng Fuji.</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => paid.refetch()}>
                Thử lại
              </Button>
            </InfoBox>
          ) : paidTx && paid.isPending ? (
            <Skeleton className="h-48 w-full rounded-2xl" />
          ) : (
            <InfoBox icon={<Loader2 className="size-5 animate-spin" />} title="Đang đồng bộ giao dịch chia tiền…">
              Máy chủ đang đọc sự kiện từ chuỗi. Màn này tự cập nhật sau vài giây.
            </InfoBox>
          )}

          <History deal={d} back={back} />

          <p className="text-sm text-muted-foreground">
            Số tiền đọc từ sự kiện <code className="font-mono">Paid</code> của smart contract, không lấy từ máy chủ của
            app.
          </p>
        </div>
      </main>
    </>
  );
}

function PaidBlock({ deal, paid, role }: { deal: DealView; paid: PaidInfo; role: Role }) {
  const rate = useVndRate();
  const vnd = (a: bigint) => formatVnd(amountToVnd(a, rate));
  const { onchain } = deal;
  const total = paid.toTenant + paid.toLandlord + paid.fee;
  // Contract-spec: người thuê + chủ trọ + phí = C + G (cọc + lãi).
  const expected = BigInt(onchain.deposit) + BigInt(onchain.yieldGross);
  const you = (r: Role) => (role === r ? " (bạn)" : "");

  return (
    <section aria-labelledby="paid" className="space-y-3">
      <h2 id="paid" className="text-lg font-bold">
        Ai nhận bao nhiêu
      </h2>
      <Rows>
        <Row label={`Người thuê${you("tenant")}`} value={vnd(paid.toTenant)} sub={formatToken(paid.toTenant)} strong tone="success" />
        <Row label={`Chủ trọ${you("landlord")}`} value={vnd(paid.toLandlord)} sub={formatToken(paid.toLandlord)} strong />
        {paid.fee > 0n && <Row label="Phí nền tảng (trên phần lãi)" value={vnd(paid.fee)} sub={formatToken(paid.fee)} />}
        <Row
          label="Tổng"
          value={vnd(total)}
          sub={total === expected ? "khớp tiền cọc trong contract" : undefined}
        />
      </Rows>
      <p className="text-sm text-foreground/80">{OUTCOME_TEXT[paid.outcome]}</p>
      {onchain.proposedAmount !== "0" && paid.outcome === "NORMAL" && (
        <Rows>
          <Row label="Chủ trọ đề xuất trừ" value={vnd(BigInt(onchain.proposedAmount))} />
          {onchain.hasAiSeal && <Row label="AI tính (có con dấu)" value={vnd(BigInt(onchain.aiAmount))} />}
          {onchain.counterAmount !== "0" && <Row label="Người thuê đưa ra" value={vnd(BigInt(onchain.counterAmount))} />}
        </Rows>
      )}
      <a
        href={explorerTxUrl + paid.txHash}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10 transition hover:bg-secondary/60"
      >
        <span>
          <span className="block font-semibold text-primary">Xem giao dịch trên Snowtrace</span>
          <span className="font-mono text-xs text-muted-foreground">
            {shortAddress(paid.txHash, 10, 6)}
            {paid.at && ` · ${formatDateTime(paid.at)}`}
          </span>
        </span>
        <ExternalLink className="size-4 shrink-0 text-primary" />
      </a>
      {DEALS_MOCK && <p className="text-xs text-muted-foreground">Dữ liệu giả: link Snowtrace không có thật.</p>}
    </section>
  );
}

function History({ deal, back }: { deal: DealView; back: string }) {
  if (deal.history.length === 0) return null;
  return (
    <section aria-labelledby="history" className="space-y-3">
      <h2 id="history" className="text-lg font-bold">
        Lịch sử trên chuỗi
      </h2>
      <ChainHistory deal={deal} />
      <Button asChild variant="outline" className="w-full">
        <Link href={back}>Về hợp đồng</Link>
      </Button>
    </section>
  );
}
