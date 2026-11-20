"use client";
// Hành động phụ một bước, chỉ cần dealId (task UI 18): gỡ phòng, báo bỏ đi, "Tôi vẫn đang ở", phản đối ảnh nhận phòng.
// Xác nhận ngay tại màn Chi tiết hợp đồng, không mở màn khác. Contract tự kiểm tra người gọi, trạng thái và hạn chót;
// UI chỉ nói rõ hệ quả TRƯỚC khi ký và việc tiếp theo SAU khi xong.
// Nút "Xử lý quá hạn" (poke) nằm ở components/poke-button.tsx để các màn khác dùng chung. "Trả phòng thay" là màn chụp ảnh
// (photo-capture-flow), mở bằng link từ deal-detail.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { TxStatus } from "@/components/tx-status";
import { addresses, escrowAbi } from "@/lib/chain";
import type { ActionId } from "@/lib/client/deal-actions";
import { DEAL_STATUS } from "@/lib/client/deal-status";
import type { DealView } from "@/lib/client/deals-data";
import { useAppConfig } from "@/lib/client/use-config";
import { useTx, type TxState } from "@/lib/client/use-tx";
import type { DealState, Timeouts } from "@/lib/types";
import { cn } from "@/lib/utils";

export type QuickTxId = "cancel" | "reportAbandon" | "contestAbandon" | "contestCheckIn";
export const QUICK_TX: QuickTxId[] = ["cancel", "reportAbandon", "contestAbandon", "contestCheckIn"];
export const isQuickTx = (id: ActionId): id is QuickTxId => (QUICK_TX as ActionId[]).includes(id);

/** "2 phút", "3 giờ", "2 ngày": độ dài một khoảng chờ trong câu văn (formatDuration là kiểu đồng hồ đếm ngược). */
export function formatWindow(sec: number): string {
  if (sec >= 86400 && sec % 86400 === 0) return `${sec / 86400} ngày`;
  if (sec >= 3600 && sec % 3600 === 0) return `${sec / 3600} giờ`;
  if (sec >= 60) return `${Math.round(sec / 60)} phút`;
  return `${sec} giây`;
}

export interface QuickTxCopy {
  fn: "cancelDeal" | "reportAbandon" | "contestAbandon" | "contestCheckIn";
  title: string;
  /** Hệ quả, nói trước khi ký. */
  text: string;
  button: string;
  /** Dòng trong khung "xong". */
  done: string;
  /** Việc tiếp theo, nói sau khi xong. */
  after: string;
  danger: boolean;
}

export function quickTxCopy(id: QuickTxId, timeouts: Timeouts | null): QuickTxCopy {
  const win = (sec: number | undefined) => (sec !== undefined ? formatWindow(sec) : "một khoảng thời gian");
  const wait = win(timeouts?.abandonWindow);
  switch (id) {
    case "contestCheckIn":
      // contract-spec > contestCheckIn: xóa hash ảnh, deadline = now + moveInGrace; hết hạn chưa chụp lại → NO_SHOW (C − R).
      return {
        fn: "contestCheckIn",
        title: "Phản đối ảnh nhận phòng?",
        text: `Ảnh người thuê gửi sẽ bị gỡ và họ phải chụp lại trong ${win(timeouts?.moveInGrace)}. Không chụp lại kịp thì người thuê được hoàn cọc, bạn giữ phí giữ chỗ. Bạn chỉ phản đối được một lần.`,
        button: "Phản đối, yêu cầu chụp lại",
        done: "Đã phản đối. Đang chờ người thuê chụp lại",
        after: `Người thuê có ${win(timeouts?.moveInGrace)} để chụp lại. Họ chụp xong thì bạn xem ảnh mới, lần này không phản đối được nữa.`,
        danger: false,
      };
    case "cancel":
      return {
        fn: "cancelDeal",
        title: "Gỡ phòng này?",
        text: "Phòng chưa có ai cọc. Gỡ xong, phòng không hiện trong danh sách nữa và không mở lại được.",
        button: "Gỡ phòng",
        done: "Đã gỡ phòng",
        after: "Phòng đã ra khỏi danh sách. Không có tiền nào bị ảnh hưởng. Muốn cho thuê tiếp, hãy đăng phòng mới.",
        danger: true,
      };
    case "reportAbandon":
      // contract-spec > Chia tiền > ABANDONED: người thuê im lặng thì chủ trọ nhận C + L/2.
      return {
        fn: "reportAbandon",
        title: "Báo người thuê đã bỏ đi?",
        text: `Người thuê có ${wait} để bấm “Tôi vẫn đang ở”. Họ im lặng tới hạn thì bạn nhận toàn bộ tiền cọc. Chỉ báo khi người thuê thật sự đã dọn đi mà không trả phòng.`,
        button: "Báo bỏ đi",
        done: "Đã báo. Đang chờ người thuê trả lời",
        after: `Người thuê có ${wait} để trả lời. Hết hạn mà họ im lặng, hợp đồng tự chuyển cọc cho bạn theo luật đã chốt.`,
        danger: false,
      };
    case "contestAbandon":
      return {
        fn: "contestAbandon",
        title: "Bạn vẫn đang ở phòng này?",
        text: "Chủ trọ báo bạn đã bỏ đi. Xác nhận để hợp đồng quay lại Đang thuê, cọc của bạn vẫn nằm yên trong contract.",
        button: "Tôi vẫn đang ở",
        done: "Đã xác nhận. Hợp đồng quay lại Đang thuê",
        after: "Cọc của bạn vẫn nằm trong contract. Khi dọn đi, hãy bấm Trả phòng và chụp ảnh như lúc nhận phòng.",
        danger: false,
      };
  }
}

/**
 * Nội dung hộp xác nhận. Thuần trình bày (màn thật bọc trong Drawer; trang xem thử đặt thẳng vào trang).
 * `changedTo`: giao dịch bị từ chối vì hợp đồng đã sang bước khác (người kia vừa làm) — không phải lỗi của người bấm.
 */
export function QuickTxSheet({
  copy,
  tx,
  changedTo,
  onSubmit,
  onClose,
}: {
  copy: QuickTxCopy;
  tx: TxState;
  changedTo: DealState | null;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const busy = tx.phase === "signing" || tx.phase === "pending";
  const done = tx.phase === "success";
  const changed = changedTo !== null && !done;

  return (
    <div className="mx-auto w-full max-w-md space-y-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <DrawerHeader className="px-0 text-left">
        <DrawerTitle className="text-xl font-extrabold text-primary">{copy.title}</DrawerTitle>
        <DrawerDescription>{copy.text}</DrawerDescription>
      </DrawerHeader>

      {tx.phase !== "idle" && !changed && <TxStatus state={tx} doneText={copy.done} />}

      {done && (
        <div className="flex items-start gap-3 rounded-xl bg-secondary p-4 text-sm [overflow-wrap:anywhere]">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold">Tiếp theo</p>
            <p className="text-foreground/80">{copy.after}</p>
          </div>
        </div>
      )}

      {changed && (
        <div role="status" className="flex items-start gap-3 rounded-xl bg-info/10 p-4 text-sm [overflow-wrap:anywhere]">
          <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold">Hợp đồng đã sang bước khác</p>
            <p className="text-foreground/80">
              Hợp đồng đang ở “{DEAL_STATUS[changedTo].label}” nên việc này không còn làm được.
              {!tx.hash && " Giao dịch của bạn không được gửi nên bạn không mất phí."}
            </p>
          </div>
        </div>
      )}

      {done || changed ? (
        <Button size="lg" className="h-14 w-full text-base" onClick={onClose}>
          Xong
        </Button>
      ) : (
        <Button
          size="lg"
          variant={copy.danger ? "destructive" : "default"}
          className={cn("h-14 w-full text-base")}
          disabled={busy}
          onClick={onSubmit}
        >
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {tx.phase === "error" ? "Thử lại" : busy ? "Đang xử lý…" : copy.button}
        </Button>
      )}
    </div>
  );
}

/** Xác nhận rồi gửi giao dịch một bước, tham số duy nhất là dealId. Xong (hoặc bị từ chối) thì tải lại deal. */
export function QuickTxDrawer({ deal, id, onClose }: { deal: DealView; id: QuickTxId | null; onClose: () => void }) {
  const tx = useTx();
  const qc = useQueryClient();
  const cfg = useAppConfig();
  // Giữ id cuối cùng để chữ trong drawer không biến mất trong lúc drawer đang đóng.
  const [shown, setShown] = useState<QuickTxId>("cancel");
  // Trạng thái lúc mở: so với trạng thái sau khi lỗi để biết "người kia vừa làm trước".
  const [before, setBefore] = useState<DealState | null>(null);
  const [changedTo, setChangedTo] = useState<DealState | null>(null);
  if (id && id !== shown) setShown(id);
  if (id && before === null) setBefore(deal.onchain.state);
  const copy = quickTxCopy(shown, cfg?.timeouts ?? null);
  const busy = tx.state.phase === "signing" || tx.state.phase === "pending";

  async function submit() {
    const receipt = await tx.run({
      address: addresses.escrow,
      abi: escrowAbi,
      functionName: copy.fn,
      args: [BigInt(deal.dealId)],
    });
    // Tải lại dù thành công hay lỗi: lỗi WrongState/DeadlinePassed thường do bên kia vừa đổi trạng thái.
    await qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] });
    if (receipt) return;
    const next = qc.getQueryData<DealView>(["deal-view", deal.dealId])?.onchain.state;
    if (next && before && next !== before) setChangedTo(next);
  }

  function change(next: boolean) {
    if (next || busy) return; // đang ký/chờ chuỗi: không cho đóng để khỏi mất dấu giao dịch
    onClose();
    setBefore(null);
    setChangedTo(null);
    tx.reset();
  }

  return (
    <Drawer open={id !== null} onOpenChange={change}>
      <DrawerContent>
        <QuickTxSheet copy={copy} tx={tx.state} changedTo={changedTo} onSubmit={submit} onClose={() => change(false)} />
      </DrawerContent>
    </Drawer>
  );
}
