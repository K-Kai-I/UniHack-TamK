"use client";
// Preview nội bộ cho task 18: hộp "Xử lý quá hạn", các hộp hành động phụ và câu quá hạn, với dữ liệu giả; không ví, không chuỗi.
// /dev/overdue?kind=poke&case=confirm|signing|pending|error|paid|moved|same|other-paid|other-moved|other-same-hash&effect=<câu>
// /dev/overdue?kind=quick&id=cancel|reportAbandon|contestAbandon|contestCheckIn&case=confirm|signing|pending|error|done|changed
// /dev/overdue?kind=note&stage=counting|waiting|ready
// Mọi nút chỉ ghi vào bảng nhật ký ẩn (#dev-log).
import { useEffect, useState } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { OverdueNote } from "@/components/deal-detail";
import { PokeSheet, type PokeResult } from "@/components/poke-button";
import { QUICK_TX, QuickTxSheet, quickTxCopy, type QuickTxId } from "@/components/quick-tx";
import { PageShell } from "@/components/page-shell";
import type { TxState } from "@/lib/client/use-tx";
import type { DealState, Hash, Timeouts } from "@/lib/types";
import type { OverdueStage } from "@/lib/client/overdue";

const HASH = `0x${"a".repeat(64)}` as Hash;
const TIMEOUTS = { abandonWindow: 172800, moveInGrace: 86400 } as unknown as Timeouts;

function txFor(c: string): TxState {
  if (c === "signing") return { phase: "signing" };
  if (c === "pending") return { phase: "pending", hash: HASH };
  if (c === "error") return { phase: "error", error: "Mất kết nối mạng. Kiểm tra mạng rồi thử lại." };
  if (c === "done" || c === "paid" || c === "moved" || c === "same") return { phase: "success", hash: HASH };
  if (c === "other-same-hash") return { phase: "error", hash: HASH, error: "Giao dịch bị từ chối." };
  return { phase: "idle" };
}

function pokeResultFor(c: string): PokeResult {
  switch (c) {
    case "paid":
      return { by: "me", outcome: { kind: "paid" } };
    case "moved":
      return { by: "me", outcome: { kind: "moved", state: "ACTIVE" } };
    case "same":
      return { by: "me", outcome: { kind: "same" } };
    case "other-paid":
      return { by: "other", outcome: { kind: "paid" } };
    case "other-moved":
    case "other-same-hash":
      return { by: "other", outcome: { kind: "moved", state: "ACTIVE" } };
    default:
      return null;
  }
}

export default function OverduePreview() {
  const [q, setQ] = useState<URLSearchParams | null>(null);
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => setQ(new URLSearchParams(window.location.search)), []);
  if (!q) return null;
  const kind = q.get("kind") ?? "poke";
  const c = q.get("case") ?? "confirm";
  const note = (s: string) => setLog((l) => [...l, s]);

  if (kind === "note") {
    const stage = (q.get("stage") ?? "counting") as OverdueStage;
    return (
      <PageShell size="read">
        <h1 className="text-xl font-extrabold">Câu quá hạn: {stage}</h1>
        <section className="mt-4 space-y-1 rounded-2xl bg-secondary p-5" data-testid="note">
          <OverdueNote stage={stage} overdue={stage !== "counting"} onTimeout="Người thuê được hoàn cọc, trừ phí giữ chỗ cho chủ trọ." />
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell size="read">
      <h1 className="text-xl font-extrabold">
        {kind} · {q.get("id") ?? ""} · {c}
      </h1>
      <ul id="dev-log" className="sr-only" aria-hidden="true">
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      <Drawer open onOpenChange={() => note("drawer-change")} modal={false} dismissible={false}>
        <DrawerContent>
          {kind === "poke" ? (
            <PokeSheet
              effect={q.get("effect") ?? "Chia tiền theo mức chủ trọ đề xuất (trừ 1.120.000 ₫)."}
              tx={txFor(c)}
              result={pokeResultFor(c)}
              receiptHref="/deals/27/receipt"
              onSubmit={() => note("submit")}
              onClose={() => note("close")}
            />
          ) : (
            <QuickTxSheet
              copy={quickTxCopy((QUICK_TX.includes(q.get("id") as QuickTxId) ? q.get("id") : "cancel") as QuickTxId, TIMEOUTS)}
              tx={txFor(c)}
              changedTo={c === "changed" ? ("RESERVED" as DealState) : null}
              onSubmit={() => note("submit")}
              onClose={() => note("close")}
            />
          )}
        </DrawerContent>
      </Drawer>
    </PageShell>
  );
}
