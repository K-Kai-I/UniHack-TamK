"use client";
// Xác nhận gửi cọc (docs/user-flow.md GĐ2). Permit là chữ ký cho phép dùng token;
// depositWithPermit vẫn là một giao dịch, do người dùng xác nhận trong ví.
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { formatUnits, isAddressEqual, zeroAddress } from "viem";
import { CheckCircle2, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { FaucetButton } from "@/components/faucet-button";
import { SuccessScreen } from "@/components/success-screen";
import { addresses, chain, explorerTxUrl, usdcAbi } from "@/lib/chain";
import { formatVnd, amountToVnd } from "@/lib/client/money";
import type { DealDetail } from "@/lib/client/rooms-data";
import { useAppConfig } from "@/lib/client/use-config";
import { useCountdown } from "@/lib/client/use-countdown";
import { useDeposit } from "@/lib/client/use-deposit";
import type { TxState } from "@/lib/client/use-tx";
import { formatDateTime } from "@/lib/client/date";

export function DepositSheet({ deal, open, onOpenChange, unavailable = false }: {
  deal: DealDetail; open: boolean; onOpenChange: (o: boolean) => void; unavailable?: boolean;
}) {
  const { address, chainId } = useAccount();
  const qc = useQueryClient();
  const { state, deposit, reset, signingStep } = useDeposit();
  const config = useAppConfig();
  const [wantYield, setWantYield] = useState(false);
  const submitting = useRef(false);
  const tokenLive = !isAddressEqual(addresses.token, zeroAddress);
  const balance = useReadContract({
    address: addresses.token, abi: usdcAbi, functionName: "balanceOf",
    args: address ? [address] : undefined, chainId: chain.id,
    query: { enabled: !!address && tokenLive && open, refetchInterval: 8000 },
  });
  const deadline = config
    ? new Date(Date.parse(deal.terms.dates.moveInDate) + config.timeouts.moveInGrace * 1000).toISOString()
    : null;
  const { passed } = useCountdown(open ? deadline : null);
  const expired = passed || (deadline !== null && Date.now() >= Date.parse(deadline));
  const yieldAvailable = deal.terms.yieldEnabled && !!addresses.vault && !isAddressEqual(addresses.vault, zeroAddress);
  const balanceState = balance.isError ? "error" : balance.data === undefined ? "loading" : "ready";
  const blocked = !address ? "Chưa có ví. Đóng màn này và đăng nhập lại để gửi cọc."
    : address.toLowerCase() === deal.onchain.landlord.toLowerCase() ? "Chủ trọ không thể tự gửi cọc phòng của mình."
    : !tokenLive || isAddressEqual(addresses.escrow, zeroAddress) ? "Chưa thể gửi cọc. Hợp đồng thử nghiệm chưa sẵn sàng."
    : chainId !== chain.id ? "Ví đang ở sai mạng. Đóng màn này và chuyển sang Avalanche Fuji để tiếp tục."
    : deal.onchain.state !== "OPEN" ? "Phòng này không còn nhận cọc. Đóng màn này để xem thông tin mới."
    : expired ? "Đã hết hạn gửi cọc. Bạn chưa thể tiếp tục với phòng này."
    : !config ? "Chưa tải được tỉ giá và hạn nhận phòng. Tải lại trước khi gửi cọc."
    : unavailable ? "Thông tin phòng đang cần cập nhật. Tải lại trước khi gửi cọc." : null;
  const short = balance.data !== undefined && balance.data < BigInt(deal.onchain.deposit);
  const busy = state.phase === "signing" || state.phase === "pending";
  const unresolved = state.phase === "error" && !!state.hash && !state.reverted;

  async function submit() {
    // Chặn ngay cả hai lần bấm trước khi React kịp cập nhật trạng thái ký.
    if (submitting.current || busy || state.phase === "success") return;
    if (!unresolved && (blocked || short || balanceState !== "ready" || (deadline && Date.now() >= Date.parse(deadline)))) return;
    submitting.current = true;
    try {
      const ok = await deposit(deal.dealId, deal.onchain.deposit, wantYield && yieldAvailable);
      if (ok) {
        void qc.invalidateQueries({ queryKey: ["deal", deal.dealId] });
        void qc.invalidateQueries({ queryKey: ["listings"] });
        void qc.invalidateQueries({ queryKey: ["my-deals"] });
      }
    } finally { submitting.current = false; }
  }

  function close(next: boolean) {
    if (busy || submitting.current) return;
    onOpenChange(next);
    // Không làm mất hash chưa có kết quả khi đóng rồi mở lại Drawer.
    if (!next && !unresolved) { reset(); setWantYield(false); }
  }

  return <>
    {!open && unresolved && <Button variant="outline" className="w-full" onClick={() => onOpenChange(true)}>Kiểm tra giao dịch gửi cọc</Button>}
    <DepositSheetView deal={deal} open={open} onOpenChange={close} state={state} signingStep={signingStep}
    rate={config?.vndPerToken ?? null} deadline={deadline} balance={balance.data} balanceState={balanceState}
    blocked={blocked} wantYield={wantYield} yieldAvailable={yieldAvailable} feeBps={config?.feeBps ?? null}
    onWantYield={setWantYield} onSubmit={() => void submit()} onReload={() => {
      void balance.refetch();
      void qc.invalidateQueries({ queryKey: ["config"] });
      void qc.invalidateQueries({ queryKey: ["deal", deal.dealId] });
    }} faucet={<FaucetButton />} />
  </>;
}

/** View dùng chung với preview; callback preview không gọi ví hay gửi giao dịch. */
export function DepositSheetView({ deal, open, onOpenChange, state, signingStep = "permit", rate, deadline,
  balance, balanceState, blocked = null, wantYield, yieldAvailable, feeBps, onWantYield, onSubmit, onReload, faucet }: {
  deal: DealDetail; open: boolean; onOpenChange: (open: boolean) => void; state: TxState;
  signingStep?: "permit" | "transaction"; rate: number | null; deadline: string | null;
  balance?: bigint; balanceState: "loading" | "error" | "ready"; blocked?: string | null;
  wantYield: boolean; yieldAvailable: boolean; feeBps: number | null;
  onWantYield: (value: boolean) => void; onSubmit: () => void; onReload: () => void; faucet?: ReactNode;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const title = useRef<HTMLHeadingElement | null>(null);
  const scroll = useRef<HTMLDivElement | null>(null);
  const amount = deal.onchain.deposit;
  const fee = deal.onchain.reserveFee;
  const vnd = (value: string | bigint) => rate === null ? "Chưa có tỉ giá" : formatVnd(amountToVnd(value, rate));
  const exactToken = (value: string | bigint) => `${formatUnits(BigInt(value), 6).replace(".", ",")} mUSDC`;
  const busy = state.phase === "signing" || state.phase === "pending";
  const done = state.phase === "success";
  const unresolved = state.phase === "error" && !!state.hash && !state.reverted;
  const short = balance !== undefined && balance < BigInt(amount);
  const disabled = busy || (!unresolved && (!!blocked || short || balanceState !== "ready" || rate === null || !deadline));

  useEffect(() => {
    if (!scroll.current || state.phase === "idle") return;
    scroll.current.scrollTop = 0;
  }, [state.phase, signingStep, done, open]);

  return <Drawer open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }} dismissible={!busy} autoFocus>
    <DrawerContent
      className="mx-auto w-full max-w-[640px] shadow-none data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-2rem)]"
      onOpenAutoFocus={event => {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        event.preventDefault();
        title.current?.focus({ preventScroll: true });
      }}
      onCloseAutoFocus={event => { event.preventDefault(); returnFocus.current?.focus({ preventScroll: true }); }}
    >
      <div className="flex shrink-0 items-start gap-3 border-b px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <DrawerTitle ref={title} tabIndex={-1} className="text-xl font-bold text-primary">{done ? "Đã gửi cọc" : "Xác nhận gửi cọc"}</DrawerTitle>
        </div>
        <Button variant="ghost" size="icon" aria-label="Đóng xác nhận gửi cọc" disabled={busy} onClick={() => onOpenChange(false)}><X aria-hidden="true" /></Button>
      </div>

      <div ref={scroll} className="min-h-0 overflow-y-auto overscroll-contain px-4 py-5 [overflow-wrap:anywhere] sm:px-6" data-deposit-scroll>
        {state.phase !== "idle" && <div className="mb-5"><DepositProgress state={state} signingStep={signingStep} /></div>}
        <DrawerDescription className="mb-5 text-base text-foreground">{deal.terms.room.title}</DrawerDescription>
        {done && <SuccessScreen title="Đã gửi cọc" text={`${vnd(amount)} đã nằm trong két của hợp đồng. Bước tiếp theo: chụp ảnh nhận phòng.`} href={`/deals/${deal.dealId}`} />}
        {done ? <div className="space-y-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-1 size-6 shrink-0 text-success" aria-hidden="true" />
            <div><p className="text-lg font-bold">Tiền cọc đã được xác nhận</p><p className="mt-1 text-muted-foreground">Mở hợp đồng để xem bước nhận phòng và gửi ảnh bằng camera trong app.</p></div>
          </div>
          <dl className="rounded-xl bg-secondary p-4"><dt>Tiền cọc đã gửi</dt><dd className="mt-1 text-2xl font-extrabold text-primary tabular-nums">{vnd(amount)}</dd></dl>
        </div> : <div className="space-y-5">
          <dl className="rounded-xl bg-secondary p-4 sm:p-5">
            <dt className="font-semibold">Tổng tiền cọc bạn gửi</dt>
            <dd className="mt-1 text-3xl font-extrabold text-primary tabular-nums">{vnd(amount)}</dd>
            <div className="mt-4 border-t border-border pt-3 text-sm">
              <dt>Phí giữ chỗ đã gồm trong cọc</dt><dd className="mt-1 font-bold tabular-nums">{vnd(fee)}</dd>
            </div>
            {/* Số dư đặt ngay cạnh số tiền phải gửi: biết đủ hay thiếu trước khi bấm. */}
            <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border pt-3 text-sm">
              <dt>Bạn đang có</dt>
              <dd className="text-right font-bold tabular-nums">
                {balanceState === "ready" && balance !== undefined
                  ? <>{vnd(balance)} <span className={short ? "text-warning-foreground" : "text-success"}>{short ? "· chưa đủ" : "· đủ"}</span></>
                  : balanceState === "error" ? "Không đọc được" : "Đang đọc…"}
              </dd>
            </div>
          </dl>
          <p className="text-sm font-semibold">Bạn chỉ gửi {rate === null ? exactToken(amount) : vnd(amount)} tiền cọc. Phí giữ chỗ không cộng thêm.</p>
          <div className="space-y-2 text-sm">
            <p>Hạn gửi ảnh nhận phòng: {deadline ? <><time dateTime={deadline} className="font-semibold tabular-nums">{formatDateTime(deadline)}</time> (giờ Việt Nam).</> : "Chưa tải được hạn. Hãy tải lại trước khi gửi cọc."}</p>
            <p>Nếu chưa gửi ảnh nhận phòng tới hạn, khi xử lý quá hạn bạn được hoàn cọc trừ {vnd(fee)} phí giữ chỗ. Phí này chuyển cho chủ trọ.</p>
          </div>
          <details className="border-y py-1 text-sm">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">Số dư và đơn vị thử nghiệm</summary>
            <dl className="space-y-3 pb-3">
              <div><dt className="text-muted-foreground">Tiền cọc thực gửi</dt><dd className="font-semibold tabular-nums">{exactToken(amount)}</dd></div>
              <div><dt className="text-muted-foreground">Số dư ví</dt><dd className="tabular-nums">{balanceState === "error" ? "Không đọc được số dư" : balanceState === "loading" ? "Đang đọc số dư…" : balance !== undefined ? `${vnd(balance)} · ${exactToken(balance)}` : "Chưa có số dư"}</dd></div>
            </dl>
          </details>
          <p className="text-sm">Bấm nút dưới, ví sẽ hỏi bạn xác nhận <span className="font-semibold">một lần</span> để gửi cọc.</p>
          <label className="flex min-h-11 items-start gap-3 rounded-xl border p-3">
            <input type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" checked={wantYield && yieldAvailable} disabled={!yieldAvailable || busy || unresolved} onChange={e => onWantYield(e.target.checked)} />
            <span><span className="block font-semibold">Cho cọc sinh lãi</span><span className="mt-1 block text-sm text-muted-foreground">{yieldAvailable
              ? `Nếu có lãi, phí sàn${feeBps === null ? " theo cấu hình hợp đồng" : ` ${feeBps / 100}% lãi`}. Lãi còn lại chia theo kết quả kết thúc hợp đồng; không cam kết mức lãi.`
              : "Chưa dùng được: chủ trọ chưa bật hoặc kho sinh lãi chưa sẵn sàng."}</span></span>
          </label>
        </div>}
      </div>

      <div className="shrink-0 space-y-3 border-t bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        {!busy && !done && !unresolved && <>
            {blocked && <div role="status" className="space-y-2 rounded-xl bg-warning/15 p-3 text-sm text-warning-foreground"><p>{blocked}</p><Button variant="outline" onClick={onReload}>Tải lại thông tin</Button></div>}
            {balanceState === "loading" && !blocked && <p role="status" className="text-sm">Đang đọc số dư ví trước khi gửi cọc…</p>}
            {balanceState === "error" && !blocked && <div role="status" className="space-y-2 rounded-xl bg-warning/15 p-3 text-sm text-warning-foreground"><p>Không đọc được số dư ví. Thử lại trước khi gửi cọc.</p><Button variant="outline" onClick={onReload}>Thử lại số dư</Button></div>}
            {short && balanceState === "ready" && !blocked && <div role="status" className="space-y-3 rounded-xl bg-warning/15 p-3 text-sm text-warning-foreground"><p>Ví còn thiếu <strong className="tabular-nums">{vnd(BigInt(amount) - balance!)}</strong> để gửi cọc.</p>{faucet}<Button variant="outline" className="w-full" onClick={onReload}>Cập nhật số dư</Button></div>}
          </>}
        {done ? <Button asChild size="lg" className="w-full"><Link href={`/deals/${deal.dealId}`}>Xem hợp đồng</Link></Button>
          : <Button size="lg" className="w-full [overflow-wrap:anywhere]" disabled={disabled} onClick={onSubmit}>
            {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {state.phase === "pending" ? "Đang xác nhận gửi cọc…" : state.phase === "signing" ? "Đang chờ bạn ký trong ví…" : unresolved ? "Kiểm tra giao dịch đã gửi" : state.phase === "error" ? "Thử gửi cọc lại" : "Xác nhận gửi cọc"}
          </Button>}
        {busy && <p className="text-sm text-muted-foreground">Giữ màn này mở để theo dõi kết quả. Bạn có thể từ chối yêu cầu chưa ký trong ví.</p>}
      </div>
    </DrawerContent>
  </Drawer>;
}

function DepositProgress({ state, signingStep }: { state: TxState; signingStep: "permit" | "transaction" }) {
  if (state.phase === "idle") return null;
  const unresolved = state.phase === "error" && !!state.hash && !state.reverted;
  const title = state.phase === "signing" ? signingStep === "permit" ? "Đang chuẩn bị gửi cọc…" : "Chờ bạn xác nhận gửi cọc trong ví"
    : state.phase === "pending" ? "Đã gửi giao dịch · đang chờ xác nhận"
    : state.phase === "success" ? "Gửi cọc thành công" : unresolved ? "Chưa đọc được kết quả gửi cọc" : "Chưa gửi cọc thành công";
  const tone = state.phase === "success" ? "bg-success/10 text-success" : state.phase === "error" ? "bg-destructive/10 text-destructive" : "bg-info/10 text-info";
  return <div role="status" aria-live="polite" className={`space-y-2 rounded-xl p-3 text-sm ${tone}`}>
    <p className="font-semibold">{title}</p>
    {state.phase === "error" && <p>{state.error ?? "Không gửi được cọc. Kiểm tra ví rồi thử lại."}</p>}
    {unresolved && <p>Giao dịch có thể đã hoàn tất. Bấm kiểm tra để đọc lại kết quả; bước này không yêu cầu ký mới.</p>}
    {state.hash && <a href={explorerTxUrl + state.hash} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4">Xem giao dịch trên Snowtrace<ExternalLink className="size-4 shrink-0" aria-hidden="true" /><span className="sr-only"> (mở thẻ mới)</span></a>}
  </div>;
}
