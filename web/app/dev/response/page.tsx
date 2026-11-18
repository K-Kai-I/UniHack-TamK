"use client";
// Preview nội bộ cho task 13: ProposeView / RespondView với dữ liệu giả, không gọi ví, API hay chuỗi.
// /dev/response?role=landlord|tenant&seal=0|1&ai=<VND>&d=<VND đề xuất>&dep=<VND cọc>&wait=1&passed=1&yield=1
//   &tx=idle|signing|pending|success|error|revert&outcome=success|error|revert&dispute=1&long=1
// Bấm nút mô phỏng chuỗi signing → pending → outcome; không ký gì thật.
import { useEffect, useMemo, useRef, useState } from "react";
import { PageColumns, PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { ProposeView, RespondView } from "@/components/deal-response";
import { fetchDealView, type DealView } from "@/lib/client/deals-data";
import { vndToAmount } from "@/lib/client/money";
import type { TxState } from "@/lib/client/use-tx";

const RATE = 25000;
const HASH = `0x${"1".repeat(64)}` as const;
const tok = (vnd: number) => vndToAmount(BigInt(vnd), RATE).toString();

function txFrom(name: string): TxState {
  switch (name) {
    case "signing": return { phase: "signing" };
    case "pending": return { phase: "pending", hash: HASH };
    case "success": return { phase: "success", hash: HASH };
    case "error": return { phase: "error", error: "Bạn đã hủy ký. Có thể thử lại khi sẵn sàng." };
    case "revert": return { phase: "error", hash: HASH, reverted: true, error: "Đề xuất đã đổi trong lúc bạn ký. Tải lại hợp đồng rồi thử lại." };
    default: return { phase: "idle" };
  }
}

export default function ResponsePreview() {
  const [q, setQ] = useState<URLSearchParams | null>(null);
  const [base, setBase] = useState<DealView | null>(null);
  const [acceptTx, setAcceptTx] = useState<TxState>({ phase: "idle" });
  const [disputeTx, setDisputeTx] = useState<TxState>({ phase: "idle" });
  const [proposeTx, setProposeTx] = useState<TxState>({ phase: "idle" });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setQ(new URLSearchParams(window.location.search));
    fetchDealView(24).then(setBase);
  }, []);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  const role = q?.get("role") === "tenant" ? "tenant" : "landlord";
  const sealed = q?.get("seal") !== "0";
  const dep = Number(q?.get("dep") ?? 6_000_000);
  const aiVnd = Number(q?.get("ai") ?? 400_000);
  const dVnd = Number(q?.get("d") ?? 400_000);
  const outcome = q?.get("outcome") ?? "success";
  const initialTx = q?.get("tx") ?? "idle";

  // Tx ban đầu theo query (để chụp trạng thái giao dịch); sau khi bấm thì mô phỏng.
  useEffect(() => {
    if (!q) return;
    const t = txFrom(initialTx);
    setAcceptTx(role === "tenant" && q.get("dispute") !== "1" ? t : { phase: "idle" });
    setDisputeTx(role === "tenant" && q.get("dispute") === "1" ? t : { phase: "idle" });
    setProposeTx(role === "landlord" ? t : { phase: "idle" });
  }, [q, initialTx, role]);

  const deal: DealView | null = useMemo(() => {
    if (!base || !q) return null;
    const long = q.get("long") === "1";
    return {
      ...base,
      terms: long ? { ...base.terms, room: { ...base.terms.room, title: "Đặng Thị Mỹ Duyên — Phòng trên đường Nguyễn Hữu Phước ".repeat(4) } } : base.terms,
      onchain: {
        ...base.onchain,
        state: role === "landlord" ? "CHECKED_OUT" : "PROPOSED",
        deposit: tok(dep),
        proposedAmount: tok(dVnd),
        aiAmount: sealed ? tok(aiVnd) : "0",
        hasAiSeal: sealed,
        yieldGross: q.get("yield") === "1" ? "1000000" : "0",
      },
    };
  }, [base, q, role, dep, dVnd, aiVnd, sealed]);

  function simulate(set: (s: TxState) => void) {
    set({ phase: "signing" });
    timers.current.push(setTimeout(() => {
      set({ phase: "pending", hash: HASH });
      timers.current.push(setTimeout(() => set(txFrom(outcome)), 700));
    }, 700));
  }

  if (!q || !deal) return null;
  const passed = q.get("passed") === "1";
  const wait = q.get("wait") === "1";

  return (
    <PageShell>
      <PageHeader href="/dev/ui" backLabel="Về danh sách" title={role === "landlord" ? "Đề xuất mức trừ" : "Trả lời đề xuất"} />
      <header className="mt-2 mb-6 space-y-3 [overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <DealStatusBadge state={deal.onchain.state} />
          <span className="text-sm text-muted-foreground">Hợp đồng #{deal.dealId} · xem thử task 13, dữ liệu giả</span>
        </div>
        <h1 className="max-w-[36ch] text-2xl leading-snug font-extrabold tracking-tight text-balance text-primary sm:text-3xl">
          {deal.terms.room.title}
        </h1>
      </header>
      <PageColumns>
        <div className="min-w-0 space-y-4">
          <p className="rounded-2xl bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
            Chỗ này là báo cáo AI (task 12): ảnh từng vị trí và kết luận.
          </p>
        </div>
        <div className="min-w-0 space-y-6">
          {role === "landlord" ? (
            <ProposeView
              deal={deal}
              rate={RATE}
              aiAmount={sealed ? BigInt(tok(aiVnd)) : null}
              waitingAi={wait}
              passed={passed}
              tx={proposeTx}
              back="/dev/ui"
              onSubmit={() => simulate(setProposeTx)}
            />
          ) : (
            <RespondView
              deal={deal}
              rate={RATE}
              passed={passed}
              acceptTx={acceptTx}
              onAccept={() => simulate(setAcceptTx)}
              disputeTx={disputeTx}
              onDispute={() => simulate(setDisputeTx)}
              onDisputeReset={() => setDisputeTx({ phase: "idle" })}
              back="/dev/ui"
            />
          )}
        </div>
      </PageColumns>
    </PageShell>
  );
}
