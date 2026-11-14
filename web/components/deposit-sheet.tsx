"use client";
// Hộp xác nhận "Gửi cọc" (docs/user-flow.md GĐ2 bước 2). Một lần xác nhận trong ví (permit + depositWithPermit).
import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { isAddressEqual, zeroAddress } from "viem";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { FaucetButton } from "@/components/faucet-button";
import { TxStatus } from "@/components/tx-status";
import { addresses, chain, usdcAbi } from "@/lib/chain";
import { formatToken, formatVnd, amountToVnd } from "@/lib/client/money";
import { MOCK_VND_PER_TOKEN, type DealDetail } from "@/lib/client/rooms-data";
import { useDeposit } from "@/lib/client/use-deposit";
import { formatDate } from "@/lib/client/date";

export function DepositSheet({
  deal,
  open,
  onOpenChange,
}: {
  deal: DealDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { terms } = deal;
  const { address } = useAccount();
  const qc = useQueryClient();
  const { state, deposit, reset } = useDeposit();
  const [wantYield, setWantYield] = useState(false);
  const [done, setDone] = useState(false);

  const tokenLive = !isAddressEqual(addresses.token, zeroAddress);
  const balance = useReadContract({
    address: addresses.token,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: chain.id,
    query: { enabled: !!address && tokenLive && open, refetchInterval: 8000 },
  });

  // TODO(spec): tỉ giá lấy từ GET /config; xem rooms-data.ts.
  const vnd = (a: string) => formatVnd(amountToVnd(a, MOCK_VND_PER_TOKEN));
  const deposit_ = terms.money.depositAmount;
  const yieldAvailable = terms.yieldEnabled && addresses.vault !== null;
  const short = balance.data !== undefined && balance.data < BigInt(deposit_);
  const busy = state.phase === "signing" || state.phase === "pending";

  async function submit() {
    const ok = await deposit(deal.dealId, deposit_, wantYield && yieldAvailable);
    if (ok) {
      setDone(true);
      // Trạng thái phòng đổi sang RESERVED: tải lại để màn chi tiết và danh sách cập nhật.
      qc.invalidateQueries({ queryKey: ["deal", deal.dealId] });
      qc.invalidateQueries({ queryKey: ["listings"] });
    }
  }

  function close(o: boolean) {
    if (busy) return; // đang ký/chờ chuỗi: không cho đóng để khỏi mất dấu giao dịch
    onOpenChange(o);
    if (!o && !done) reset();
  }

  return (
    <Drawer open={open} onOpenChange={close}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {done ? (
            <div className="space-y-4 py-6 text-center">
              <CheckCircle2 className="mx-auto size-12 text-success" />
              <DrawerTitle className="text-xl font-extrabold text-primary">Đã gửi cọc</DrawerTitle>
              <DrawerDescription>
                Tiền cọc đang nằm trong smart contract. Tới ngày {formatDate(terms.dates.moveInDate)}, hãy chụp ảnh nhận
                phòng trong app.
              </DrawerDescription>
              <TxStatus state={state} doneText="Gửi cọc thành công" />
              <Button size="lg" className="h-14 w-full text-base" onClick={() => onOpenChange(false)}>
                Xong
              </Button>
            </div>
          ) : (
            <>
              <DrawerHeader className="px-0 text-left">
                <DrawerTitle className="text-xl font-extrabold text-primary">Gửi cọc</DrawerTitle>
                <DrawerDescription>{terms.room.title}</DrawerDescription>
              </DrawerHeader>

              <dl className="divide-y rounded-2xl bg-card ring-1 ring-foreground/10">
                <div className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <dt className="text-muted-foreground">Bạn gửi</dt>
                  <dd className="text-right tabular-nums">
                    <span className="text-xl font-extrabold text-primary">{vnd(deposit_)}</span>
                    <span className="block text-xs text-muted-foreground">{formatToken(deposit_)}</span>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <dt className="text-muted-foreground">Phí giữ chỗ (mất nếu không đến)</dt>
                  <dd className="font-semibold tabular-nums">{vnd(terms.money.reserveFeeAmount)}</dd>
                </div>
                {balance.data !== undefined && (
                  <div className="flex items-baseline justify-between gap-4 px-4 py-3">
                    <dt className="text-muted-foreground">Ví của bạn có</dt>
                    <dd className="font-semibold tabular-nums">{formatToken(balance.data)}</dd>
                  </div>
                )}
              </dl>

              <p className="mt-3 text-sm text-muted-foreground">
                Bạn chỉ xác nhận một lần trong ví. Tiền chỉ đi theo smart contract: trả lại bạn, chia theo kết quả trả phòng,
                không ai tự rút được.
              </p>

              <label
                className={
                  "mt-3 flex items-start gap-3 rounded-2xl p-4 ring-1 ring-foreground/10 " +
                  (yieldAvailable ? "bg-card" : "bg-muted opacity-70")
                }
              >
                <input
                  type="checkbox"
                  className="mt-1 size-5 accent-[var(--primary)]"
                  checked={wantYield && yieldAvailable}
                  disabled={!yieldAvailable || busy}
                  onChange={(e) => setWantYield(e.target.checked)}
                />
                <span className="space-y-0.5">
                  <span className="block font-semibold">Cho cọc sinh lãi</span>
                  <span className="block text-sm text-muted-foreground">
                    {yieldAvailable
                      ? "Cọc được gửi vào kho sinh lãi trong lúc thuê. Lãi chia theo spec, trừ phí sàn."
                      : "Chưa dùng được: chủ trọ không bật hoặc kho sinh lãi chưa triển khai."}
                  </span>
                </span>
              </label>

              {short && (
                <div className="mt-3 space-y-2 rounded-xl bg-warning/15 p-3 text-sm">
                  <p className="font-semibold">Ví chưa đủ mUSDC để gửi cọc.</p>
                  <FaucetButton />
                </div>
              )}

              {state.phase !== "idle" && (
                <div className="mt-3">
                  <TxStatus state={state} />
                </div>
              )}

              <Button size="lg" className="mt-4 h-14 w-full text-base" disabled={busy || short} onClick={submit}>
                {busy && <Loader2 className="animate-spin" />}
                {state.phase === "error" ? "Thử lại" : `Gửi cọc ${vnd(deposit_)}`}
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
