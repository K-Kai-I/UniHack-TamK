"use client";
// Nút "Xử lý quá hạn" (poke): hiện cho MỌI người khi canPoke = true (contract-spec > Nút trên app theo trạng thái).
// Bot keeper gọi poke mỗi phút; nút này là đường dự phòng khi bot ngừng (user-flow > Nguyên tắc), nên tiền không kẹt.
//
// canPoke lấy từ GET /deals/:id. Nhưng ngay lúc hết hạn, giờ của khối mới nhất trên chuỗi thường chậm hơn đồng hồ
// điện thoại vài giây, nên API vẫn trả false. Khi đó hỏi thẳng contract `canPoke(id)` mỗi 4 giây tới khi true,
// để nút tự hiện mà người dùng không phải tải lại trang.
//
// Task UI 18: hộp xác nhận tách thành `PokeSheet` (chỉ trình bày, xem thử được không cần ví) và `PokeDrawer` (ký giao dịch).
// Bốn kết cục khác nhau, không gộp một câu: (1) chờ contract cho phép, (2) mình bấm và xong, (3) bot/người khác đã xử lý
// trước nên giao dịch bị từ chối, (4) lỗi thật (mạng, ví, hủy ký) có nút thử lại.
import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useReadContract } from "wagmi";
import { CheckCircle2, Info, Loader2, TimerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { TxStatus } from "@/components/tx-status";
import { addresses, chain, escrowAbi, explorerTxUrl } from "@/lib/chain";
import { TERMINAL_STATES, pokeEffect } from "@/lib/client/deal-actions";
import { DEAL_STATUS } from "@/lib/client/deal-status";
import { DEALS_MOCK, type DealView } from "@/lib/client/deals-data";
import { amountToVnd, formatVnd } from "@/lib/client/money";
import { overdueStage, stepOutcome, type OverdueStage, type StepOutcome } from "@/lib/client/overdue";
import { useCountdown } from "@/lib/client/use-countdown";
import { useTx, type TxState } from "@/lib/client/use-tx";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import type { DealState } from "@/lib/types";
import { cn } from "@/lib/utils";

/** true khi ai cũng gọi được poke cho deal này (API báo, hoặc contract báo khi API chưa kịp). */
export function useCanPoke(deal: DealView): boolean {
  const o = deal.onchain;
  const { passed } = useCountdown(o.deadline);
  // Bản giả không có deal thật trên chuỗi: chỉ tin API giả.
  const askChain = !DEALS_MOCK && passed && !o.canPoke && !TERMINAL_STATES.includes(o.state);
  const live = useReadContract({
    address: addresses.escrow,
    abi: escrowAbi,
    functionName: "canPoke",
    args: [BigInt(deal.dealId)],
    chainId: chain.id,
    query: { enabled: askChain, refetchInterval: (q) => (q.state.data ? false : 4000) },
  });
  return o.canPoke || (askChain && live.data === true);
}

/** Giai đoạn hạn chót của deal: còn hạn / đã quá hạn chờ contract / bấm được. Dùng để chọn câu chữ, không để chặn nút. */
export function usePokeStage(deal: DealView): OverdueStage {
  const canPoke = useCanPoke(deal);
  const { now } = useCountdown(deal.onchain.deadline);
  return overdueStage(deal.onchain.state, deal.onchain.deadline, now, canPoke);
}

/** Chỉ cái nút. Màn nào tự giữ state mở drawer (như thanh hành động ở Chi tiết hợp đồng) thì dùng cái này + PokeDrawer. */
export function PokeTrigger({
  onClick,
  className,
  big = true,
}: {
  onClick: () => void;
  className?: string;
  big?: boolean;
}) {
  return (
    <Button size="lg" className={cn("w-full text-base", big ? "h-14" : "h-12", className)} onClick={onClick}>
      <TimerOff aria-hidden="true" /> Xử lý quá hạn
    </Button>
  );
}

export function PokeButton({
  deal,
  receiptHref,
  className,
  big = true,
}: {
  deal: DealView;
  /** Poke chia tiền xong thì mời mở biên nhận. */
  receiptHref: string;
  className?: string;
  big?: boolean;
}) {
  const can = useCanPoke(deal);
  const [open, setOpen] = useState(false);
  // Giữ drawer khi đã mở: poke xong thì canPoke về false, nhưng người dùng còn cần thấy kết quả.
  // Chỉ đúng khi component cha KHÔNG gỡ nút này lúc canPoke về false; cha nào có thể gỡ thì dùng PokeTrigger + PokeDrawer.
  if (!can && !open) return null;
  return (
    <>
      {can && <PokeTrigger onClick={() => setOpen(true)} className={className} big={big} />}
      <PokeDrawer deal={deal} open={open} onClose={() => setOpen(false)} receiptHref={receiptHref} />
    </>
  );
}

// ------------------------------------------------------------------ hộp xác nhận (chỉ trình bày)

/** Kết quả của lần bấm này. null = chưa bấm. `mine` = giao dịch của mình; `other` = người/bot khác đã xử lý trước. */
export type PokeResult = { by: "me" | "other"; outcome: StepOutcome } | null;

function stateLabel(s: DealState): string {
  return DEAL_STATUS[s].label;
}

/** Câu kết quả. "other": giao dịch của mình KHÔNG được gửi đi nên nói rõ không mất phí (chỉ khi chưa có hash). */
function resultCopy(result: NonNullable<PokeResult>, hasHash: boolean) {
  const { by, outcome } = result;
  const head = by === "me" ? "Đã xử lý quá hạn" : "Đã có người xử lý trước bạn";
  const why =
    by === "other"
      ? `Thường là bot tự động của app đã chạy trước. ${hasHash ? "" : "Giao dịch của bạn không được gửi nên bạn không mất phí. "}`
      : "";
  switch (outcome.kind) {
    case "paid":
      return { title: by === "me" ? "Đã chia tiền" : head, body: `${why}Contract đã chia tiền cọc. Số tiền mỗi bên nhận nằm ở biên nhận.` };
    case "closed":
      return { title: by === "me" ? "Đã đóng tin" : head, body: `${why}Tin đã đóng, không có tiền nào đang được giữ.` };
    case "moved":
      return { title: head, body: `${why}Hợp đồng đã chuyển sang “${stateLabel(outcome.state)}”.` };
    case "same":
      return {
        title: "Đã gửi giao dịch",
        body: "Chưa đọc được trạng thái mới từ contract. Tải lại trang để xem hợp đồng đang ở bước nào.",
      };
  }
}

/**
 * Nội dung hộp "Xử lý quá hạn". Thuần trình bày: màn dùng thật bọc trong Drawer (PokeDrawer), trang xem thử đặt thẳng vào trang.
 * `effect`: câu "bấm thì contract làm gì", chốt lúc mở hộp (poke xong deal đổi trạng thái, câu tính lại sẽ sai).
 */
export function PokeSheet({
  effect,
  tx,
  result,
  receiptHref,
  onSubmit,
  onClose,
}: {
  effect: string;
  tx: TxState;
  result: PokeResult;
  receiptHref: string;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const busy = tx.phase === "signing" || tx.phase === "pending";
  const copy = result && resultCopy(result, !!tx.hash);
  const other = result?.by === "other";
  // "Đã có người xử lý" không phải lỗi: không hiện khung đỏ "Không thành công".
  const showTx = tx.phase !== "idle" && !other;

  return (
    <div className="mx-auto w-full max-w-md space-y-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <DrawerHeader className="px-0 text-left">
        <DrawerTitle className="text-xl font-extrabold text-primary">{copy ? copy.title : "Xử lý quá hạn"}</DrawerTitle>
        {/* Có kết quả thì nội dung nằm ở khung bên dưới; mô tả này chỉ để trình đọc màn hình biết đây là kết quả. */}
        <DrawerDescription className={cn(copy && "sr-only")}>
          {copy ? "Kết quả của lần xử lý quá hạn." : "Hạn chót đã qua. Bấm để contract chạy bước tiếp theo."}
        </DrawerDescription>
      </DrawerHeader>

      {copy ? (
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl p-4 text-sm [overflow-wrap:anywhere]",
            other ? "bg-info/10 text-foreground" : "bg-success/10 text-foreground",
          )}
        >
          {other ? (
            <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          )}
          <p>{copy.body}</p>
        </div>
      ) : (
        <dl className="divide-y rounded-xl bg-secondary text-sm [overflow-wrap:anywhere]">
          <div className="space-y-1 p-4">
            <dt className="font-semibold text-muted-foreground">Khi bấm, contract sẽ</dt>
            <dd className="text-foreground">{effect}</dd>
          </div>
          <div className="space-y-1 p-4">
            <dt className="font-semibold text-muted-foreground">Ai bấm được</dt>
            <dd className="text-foreground">Bất kỳ ai. Người bấm chỉ trả phí giao dịch.</dd>
          </div>
          <div className="space-y-1 p-4">
            <dt className="font-semibold text-muted-foreground">Tiền đi đâu</dt>
            <dd className="text-foreground">Chỉ theo contract. Người bấm không nhận được tiền cọc.</dd>
          </div>
        </dl>
      )}

      {showTx && <TxStatus state={tx} doneText="Đã gửi giao dịch xử lý quá hạn" />}
      {result && tx.hash && other && (
        <a
          href={explorerTxUrl + tx.hash}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4"
        >
          Xem giao dịch bạn đã gửi trên Snowtrace<span className="sr-only"> (mở thẻ mới)</span>
        </a>
      )}

      {result ? (
        result.outcome.kind === "paid" ? (
          <div className="space-y-2">
            <Button asChild size="lg" className="h-14 w-full text-base">
              <Link href={receiptHref}>Xem biên nhận</Link>
            </Button>
            <Button size="lg" variant="outline" className="h-12 w-full text-base" onClick={onClose}>
              Đóng
            </Button>
          </div>
        ) : (
          <Button size="lg" className="h-14 w-full text-base" onClick={onClose}>
            Xong
          </Button>
        )
      ) : (
        <Button size="lg" className="h-14 w-full text-base" disabled={busy} onClick={onSubmit}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {tx.phase === "error" ? "Thử lại" : busy ? "Đang xử lý…" : "Xử lý ngay"}
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ hộp xác nhận (ký giao dịch)

export function PokeDrawer({
  deal,
  open,
  onClose,
  receiptHref,
}: {
  deal: DealView;
  open: boolean;
  onClose: () => void;
  receiptHref: string;
}) {
  const rate = useVndRate();
  const tx = useTx();
  const qc = useQueryClient();
  const [result, setResult] = useState<PokeResult>(null);
  // Chốt lúc mở: câu mô tả và trạng thái ban đầu (poke xong deal đổi trạng thái, tính lại sẽ sai).
  const [snap, setSnap] = useState<{ effect: string; before: DealState } | null>(null);
  if (open && !snap) {
    setSnap({ effect: pokeEffect(deal, (a) => formatVnd(amountToVnd(a, rate))), before: deal.onchain.state });
  }

  const busy = tx.state.phase === "signing" || tx.state.phase === "pending";

  async function submit() {
    if (!snap) return;
    const receipt = await tx.run({
      address: addresses.escrow,
      abi: escrowAbi,
      functionName: "poke",
      args: [BigInt(deal.dealId)],
    });
    // Tải lại deal dù thành công hay lỗi: lỗi NothingToPoke/WrongState thường là bot vừa xử lý trước.
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] }),
      qc.invalidateQueries({ queryKey: ["dispute", deal.dealId] }),
      qc.invalidateQueries({ queryKey: ["juror-disputes"] }),
    ]);
    const outcome = stepOutcome(snap.before, qc.getQueryData<DealView>(["deal-view", deal.dealId]));
    if (receipt) setResult({ by: "me", outcome });
    // Lỗi mà trạng thái đã đổi = có người xử lý trước. Trạng thái không đổi thì là lỗi thật, giữ nút Thử lại.
    else if (outcome.kind !== "same") setResult({ by: "other", outcome });
  }

  function change(next: boolean) {
    if (next || busy) return; // đang ký/chờ chuỗi: không cho đóng để khỏi mất dấu giao dịch
    onClose();
    setSnap(null);
    setResult(null);
    tx.reset();
  }

  return (
    <Drawer open={open} onOpenChange={change}>
      <DrawerContent>
        <PokeSheet
          effect={snap?.effect ?? ""}
          tx={tx.state}
          result={result}
          receiptHref={receiptHref}
          onSubmit={submit}
          onClose={() => change(false)}
        />
      </DrawerContent>
    </Drawer>
  );
}
