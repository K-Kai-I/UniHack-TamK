// Link Snowtrace cho người muốn tự kiểm chứng (PRODUCT.md: thuật ngữ crypto chỉ ở biên nhận hoặc phần chi tiết).
//  - ChainHistory: các giao dịch của hợp đồng (dựng từ event contract, GET /deals/:id > history), mỗi dòng mở Snowtrace.
//  - ChainProof: khối thu gọn ở Chi tiết hợp đồng: địa chỉ contract, mã khóa bộ ảnh, và lịch sử.
import { ChevronRight, ExternalLink, ShieldCheck } from "lucide-react";
import { addresses, explorerTxUrl } from "@/lib/chain";
import type { DealView } from "@/lib/client/deals-data";
import { DEALS_MOCK } from "@/lib/client/deals-data";
import { formatDateTime } from "@/lib/client/date";
import { shortAddress } from "@/lib/client/money";

/** https://testnet.snowtrace.io/address/ (cùng gốc với link giao dịch). */
export const explorerAddressUrl = explorerTxUrl.replace(/tx\/$/, "address/");

/** Tên event trong history → câu tiếng Việt. */
export const EVENT_TEXT: Record<string, string> = {
  DealCreated: "Chủ trọ đăng phòng",
  Deposited: "Người thuê gửi cọc",
  CheckInSubmitted: "Gửi ảnh nhận phòng",
  CheckInContested: "Chủ trọ phản đối ảnh nhận phòng",
  MismatchReported: "Báo phòng sai mô tả",
  AbandonReported: "Báo người thuê bỏ đi",
  AbandonContested: "Người thuê xác nhận còn ở",
  CheckedOut: "Gửi ảnh trả phòng",
  Proposed: "Chủ trọ đề xuất mức trừ",
  DisputeOpened: "Mở tranh chấp, chờ bồi thẩm",
  Voted: "Bồi thẩm bỏ phiếu",
  Paid: "Chia tiền",
  DealCancelled: "Gỡ phòng",
  "StateChanged:ACTIVE": "Bắt đầu thuê",
};

export function ChainHistory({ deal }: { deal: DealView }) {
  if (deal.history.length === 0) return null;
  return (
    <ol className="divide-y rounded-2xl bg-card ring-1 ring-foreground/10">
      {deal.history.map((h, i) => (
        <li key={`${h.txHash}-${i}`}>
          <a
            href={explorerTxUrl + h.txHash}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-secondary/60"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{EVENT_TEXT[h.event] ?? h.event}</span>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(h.at)} · <span className="font-mono">{shortAddress(h.txHash, 8, 4)}</span>
              </span>
            </span>
            <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-label="Mở trên Snowtrace" />
          </a>
        </li>
      ))}
    </ol>
  );
}

export function ChainProof({ deal }: { deal: DealView }) {
  const sets = [
    { label: "Bộ ảnh nhận phòng", hash: deal.photoSets.checkin?.setHash },
    { label: "Bộ ảnh trả phòng", hash: deal.photoSets.checkout?.setHash },
    { label: "Bộ ảnh báo phòng sai", hash: deal.photoSets.mismatch?.setHash },
  ].filter((s) => s.hash);

  return (
    <details className="group rounded-2xl bg-card ring-1 ring-foreground/10 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 select-none">
        <ShieldCheck className="size-5 shrink-0 text-primary" />
        <span className="flex-1">
          <span className="block font-semibold text-primary">Kiểm chứng trên chuỗi</span>
          <span className="text-xs text-muted-foreground">Contract, mã khóa bộ ảnh, các giao dịch trên Snowtrace</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-90" aria-hidden />
      </summary>
      <div className="space-y-3 border-t px-4 py-3">
        <a
          href={explorerAddressUrl + addresses.escrow}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-3 rounded-xl bg-secondary/50 px-3 py-2 transition hover:bg-secondary"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">Contract giữ cọc · hợp đồng #{deal.dealId}</span>
            <span className="font-mono text-xs text-muted-foreground">{shortAddress(addresses.escrow, 10, 6)}</span>
          </span>
          <ExternalLink className="size-4 shrink-0 text-primary" aria-label="Mở trên Snowtrace" />
        </a>
        {sets.length > 0 && (
          <dl className="space-y-1.5 text-sm">
            {sets.map((s) => (
              <div key={s.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{s.label}</dt>
                <dd className="font-mono text-xs" title={s.hash}>
                  {shortAddress(s.hash!, 10, 6)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {deal.history.length > 0 ? (
          <ChainHistory deal={deal} />
        ) : (
          <p className="text-sm text-muted-foreground">Chưa đồng bộ được giao dịch nào của hợp đồng này.</p>
        )}
        {DEALS_MOCK && <p className="text-xs text-muted-foreground">Dữ liệu giả: link giao dịch không có thật.</p>}
      </div>
    </details>
  );
}
