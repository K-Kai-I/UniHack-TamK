"use client";
// Nút "Xử lý quá hạn" (poke): hiện cho MỌI người khi canPoke = true (contract-spec > Nút trên app theo trạng thái).
// Bot keeper gọi poke mỗi phút; nút này là đường dự phòng khi bot ngừng (user-flow > Nguyên tắc), nên tiền không kẹt.
//
// canPoke lấy từ GET /deals/:id. Nhưng ngay lúc hết hạn, giờ của khối mới nhất trên chuỗi thường chậm hơn đồng hồ
// điện thoại vài giây, nên API vẫn trả false. Khi đó hỏi thẳng contract `canPoke(id)` mỗi 4 giây tới khi true,
// để nút tự hiện mà người dùng không phải tải lại trang.
import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useReadContract } from "wagmi";
import { Loader2, TimerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { TxStatus } from "@/components/tx-status";
import { addresses, chain, escrowAbi } from "@/lib/chain";
import { pokeEffect } from "@/lib/client/deal-actions";
import { DEALS_MOCK, type DealView } from "@/lib/client/deals-data";
import { amountToVnd, formatVnd } from "@/lib/client/money";
import { useCountdown } from "@/lib/client/use-countdown";
import { useTx } from "@/lib/client/use-tx";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import type { DealState } from "@/lib/types";
import { cn } from "@/lib/utils";

const TERMINAL: DealState[] = ["SETTLED", "REFUNDED", "CANCELLED"];
const PAID: DealState[] = ["SETTLED", "REFUNDED"];

/** true khi ai cũng gọi được poke cho deal này (API báo, hoặc contract báo khi API chưa kịp). */
export function useCanPoke(deal: DealView): boolean {
  const o = deal.onchain;
  const { passed } = useCountdown(o.deadline);
  // Bản giả không có deal thật trên chuỗi: chỉ tin API giả.
  const askChain = !DEALS_MOCK && passed && !o.canPoke && !TERMINAL.includes(o.state);
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
  if (!can && !open) return null;
  return (
    <>
      {can && (
        <Button size="lg" className={cn("w-full text-base", big ? "h-14" : "h-12", className)} onClick={() => setOpen(true)}>
          <TimerOff /> Xử lý quá hạn
        </Button>
      )}
      <PokeDrawer deal={deal} open={open} onClose={() => setOpen(false)} receiptHref={receiptHref} />
    </>
  );
}

function PokeDrawer({
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
  const [paid, setPaid] = useState(false);
  // Chốt câu mô tả lúc mở: poke xong deal đổi trạng thái, câu tính lại sẽ sai.
  const [effect, setEffect] = useState("");
  const [opened, setOpened] = useState(false);
  if (open && !opened) {
    setOpened(true);
    setEffect(pokeEffect(deal, (a) => formatVnd(amountToVnd(a, rate))));
  }

  const busy = tx.state.phase === "signing" || tx.state.phase === "pending";
  const done = tx.state.phase === "success";

  async function submit() {
    const receipt = await tx.run({
      address: addresses.escrow,
      abi: escrowAbi,
      functionName: "poke",
      args: [BigInt(deal.dealId)],
    });
    // Lỗi NothingToPoke thường là bot keeper vừa xử lý trước: tải lại để thấy trạng thái mới.
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] }),
      qc.invalidateQueries({ queryKey: ["dispute", deal.dealId] }),
      qc.invalidateQueries({ queryKey: ["juror-disputes"] }),
    ]);
    if (!receipt) return;
    const next = qc.getQueryData<DealView>(["deal-view", deal.dealId]);
    setPaid(!!next && PAID.includes(next.onchain.state));
  }

  function change(next: boolean) {
    if (next || busy) return; // đang ký/chờ chuỗi: không cho đóng để khỏi mất dấu giao dịch
    onClose();
    setOpened(false);
    setPaid(false);
    tx.reset();
  }

  return (
    <Drawer open={open} onOpenChange={change}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md space-y-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="text-xl font-extrabold text-primary">Xử lý quá hạn</DrawerTitle>
            <DrawerDescription>
              Hạn chót đã qua. {effect} Ai bấm cũng được: người bấm chỉ trả phí giao dịch, tiền vẫn chỉ đi theo
              contract.
            </DrawerDescription>
          </DrawerHeader>
          {tx.state.phase !== "idle" && <TxStatus state={tx.state} doneText="Đã xử lý quá hạn" />}
          {done ? (
            paid ? (
              <Button asChild size="lg" className="h-14 w-full text-base">
                <Link href={receiptHref}>Xem biên nhận</Link>
              </Button>
            ) : (
              <Button size="lg" className="h-14 w-full text-base" onClick={() => change(false)}>
                Xong
              </Button>
            )
          ) : (
            <Button size="lg" className="h-14 w-full text-base" disabled={busy} onClick={submit}>
              {busy && <Loader2 className="animate-spin" />}
              {tx.state.phase === "error" ? "Thử lại" : "Xử lý ngay"}
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
