"use client";
// Preview nội bộ cho task 17: DealReceiptView với dữ liệu giả, không gọi ví, API hay chuỗi.
// /dev/receipt?state=SETTLED|REFUNDED&outcome=NORMAL|NO_SHOW|MISMATCH|ABANDONED|LANDLORD_SILENT
//   &status=ready|loading|syncing|error|unreadable&as=tenant|landlord|viewer
//   &hist=full|dispute|none&tt=<VND người thuê>&tl=<VND chủ trọ>&fee=<VND phí>&dep=<VND cọc>&yield=<VND lãi>
//   &d=<VND chủ trọ đề xuất>&c=<VND người thuê đưa>&ai=0|1&bad=1 (tổng lệch)&stale=1&long=1
// Mọi nút chỉ ghi vào bảng nhật ký ẩn.
import { useEffect, useMemo, useState } from "react";
import { DealReceiptView, type PaidStatus } from "@/components/deal-receipt";
import { fetchDealView, type DealView } from "@/lib/client/deals-data";
import { vndToAmount } from "@/lib/client/money";
import { OUTCOMES, type Outcome } from "@/lib/client/receipt";
import type { DealState, Hash } from "@/lib/types";

const RATE = 25000;
const H = (c: string) => `0x${c.repeat(64)}` as Hash;
const big = (vnd: number) => BigInt(vndToAmount(BigInt(vnd), RATE));
const tok = (vnd: number) => vndToAmount(BigInt(vnd), RATE);
const at = (min: number) => new Date(Date.UTC(2026, 10, 17, 3, 0) + min * 60_000).toISOString();

const FULL = [
  { event: "DealCreated", txHash: H("1"), at: at(-60 * 24 * 40) },
  { event: "Deposited", txHash: H("2"), at: at(-60 * 24 * 38) },
  { event: "CheckInSubmitted", txHash: H("3"), at: at(-60 * 24 * 37) },
  { event: "StateChanged:ACTIVE", txHash: H("4"), at: at(-60 * 24 * 36) },
  { event: "CheckedOut", txHash: H("5"), at: at(-60 * 24 * 3) },
  { event: "Proposed", txHash: H("6"), at: at(-60 * 24 * 2) },
];

export default function ReceiptPreview() {
  const [q, setQ] = useState<URLSearchParams | null>(null);
  const [base, setBase] = useState<DealView | null>(null);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    setQ(new URLSearchParams(window.location.search));
    fetchDealView(27).then(setBase);
  }, []);

  const view = useMemo(() => {
    if (!base || !q) return null;
    const state = (q.get("state") ?? "SETTLED") as DealState;
    const outcome = (OUTCOMES.includes(q.get("outcome") as Outcome) ? q.get("outcome") : state === "REFUNDED" ? "NO_SHOW" : "NORMAL") as Outcome;
    const dep = Number(q.get("dep") ?? 6_000_000);
    const yieldV = Number(q.get("yield") ?? 0);
    const reserve = 300_000;
    const dMine = Number(q.get("d") ?? 1_120_000);
    const feeV = Number(q.get("fee") ?? 0);
    // Mặc định tính theo bảng Outcome để tổng khớp C + G; có thể ghi đè bằng tt/tl.
    const L = yieldV - feeV;
    const tenantDefault = outcome === "NORMAL" ? dep - dMine + (L - Math.floor(L / 2))
      : outcome === "NO_SHOW" ? dep - reserve + L
      : outcome === "MISMATCH" ? dep + L
      : outcome === "ABANDONED" ? L - Math.floor(L / 2)
      : dep + (L - Math.floor(L / 2));
    const landlordDefault = outcome === "NORMAL" ? dMine + Math.floor(L / 2)
      : outcome === "NO_SHOW" ? reserve
      : outcome === "MISMATCH" ? 0
      : outcome === "ABANDONED" ? dep + Math.floor(L / 2)
      : Math.floor(L / 2);
    const tt = Number(q.get("tt") ?? tenantDefault) + (q.get("bad") === "1" ? 50_000 : 0);
    const tl = Number(q.get("tl") ?? landlordDefault);
    const hist = q.get("hist") ?? "full";
    const long = q.get("long") === "1";
    const history = hist === "none" ? [] : [
      ...FULL,
      ...(hist === "dispute"
        ? [
            { event: "DisputeOpened", txHash: H("7"), at: at(-60 * 24) },
            { event: "Voted", txHash: H("8"), at: at(-60 * 20) },
          ]
        : []),
      ...(q.get("status") === "syncing" ? [] : [{ event: "Paid", txHash: H("a"), at: at(0) }]),
    ];
    const title = long ? "Đặng Thị Mỹ Duyên — Phòng trên đường Nguyễn Hữu Phước, ngõ 12 ".repeat(3) : base.terms.room.title;
    const hasAi = q.get("ai") !== "0";
    const deal: DealView = {
      ...base,
      terms: { ...base.terms, room: { ...base.terms.room, title, address: long ? "Số 12, ngõ 345/6/7 đường Nguyễn Hữu Phước, phường Đa Kao, quận 1, TP. Hồ Chí Minh ".repeat(2) : base.terms.room.address } },
      onchain: {
        ...base.onchain,
        state,
        deposit: tok(dep),
        reserveFee: tok(reserve),
        yieldGross: tok(yieldV),
        proposedAmount: outcome === "NORMAL" ? tok(dMine) : "0",
        counterAmount: q.get("c") ? tok(Number(q.get("c"))) : "0",
        aiAmount: hasAi ? tok(640_000) : "0",
        hasAiSeal: hasAi,
        tenant: base.onchain.tenant,
      },
      history,
    };
    const rawStatus = q.get("status") ?? "ready";
    const tx = { hash: H("a"), at: at(0) };
    const status: PaidStatus =
      rawStatus === "loading" ? { kind: "loading", tx }
      : rawStatus === "syncing" ? { kind: "syncing" }
      : rawStatus === "error" ? { kind: "error", tx }
      : rawStatus === "unreadable" ? { kind: "unreadable", tx }
      : { kind: "ready", paid: { outcome, toTenant: big(tt), toLandlord: big(tl), fee: big(feeV), txHash: tx.hash, at: tx.at } };
    return { deal, status };
  }, [base, q]);

  if (!q || !view) return null;
  const note = (s: string) => setLog((l) => [...l.slice(-4), s]);

  const role = (q.get("as") ?? "tenant") as "tenant" | "landlord" | "viewer";
  return (
    <>
      <DealReceiptView
        deal={view.deal}
        status={view.status}
        role={role}
        back="/dev/ui"
        rate={RATE}
        staleError={q.get("stale") === "1"}
        onReloadDeal={() => note("tải lại hợp đồng")}
        onRetryPaid={() => note("thử lại đọc Paid")}
      />
      <p className="sr-only" role="log" data-testid="preview-log">
        {log.join(" | ")}
      </p>
    </>
  );
}
