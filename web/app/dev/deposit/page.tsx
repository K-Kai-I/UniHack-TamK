"use client";
// Preview nội bộ: chỉ đổi state của cùng view, không gọi hook ví hay faucet thật.
import { useEffect, useRef, useState } from "react";
import { DepositSheetView } from "@/components/deposit-sheet";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/page-shell";
import { WALL_SAMPLE_TERMS, type DealDetail } from "@/lib/client/rooms-data";
import type { TxState } from "@/lib/client/use-tx";

const HASH = `0x${"1".repeat(64)}` as const;
const options = {
  ready: "Đủ số dư", short: "Thiếu số dư", balanceLoading: "Đang đọc số dư", balanceError: "Lỗi đọc số dư",
  config: "Thiếu cấu hình", expired: "Hết hạn", reserved: "Phòng đã có người cọc", stale: "Cần cập nhật phòng", wallet: "Chưa có ví",
  yield: "Có sinh lãi", zeroFee: "Phí giữ chỗ bằng 0", long: "Tên, tiền và lỗi dài", permit: "Chờ ký cho phép", transaction: "Chờ ký giao dịch",
  pending: "Đang xác nhận", cancelled: "Hủy ký", reverted: "Chuỗi từ chối · có hash", unknown: "Mất mạng sau khi gửi", unknownReserved: "Mất mạng · phòng đã nhận cọc", success: "Thành công · phòng thành RESERVED",
};
const sample: DealDetail = {
  dealId: 12, terms: WALL_SAMPLE_TERMS,
  onchain: { state: "OPEN", landlord: WALL_SAMPLE_TERMS.landlord, tenant: null, deposit: "240000000", reserveFee: "20000000" },
  listingPhotoUrls: [], examplePhotoUrls: {},
};

export default function DepositPreview() {
  const [scenario, setScenario] = useState("ready");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<TxState>({ phase: "idle" });
  const [step, setStep] = useState<"permit" | "transaction">("permit");
  const [wantYield, setWantYield] = useState(false);
  const [reloaded, setReloaded] = useState(false);
  const [outcome, setOutcome] = useState("success");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function show() {
    // Giữ kết quả chưa xác định qua lượt đóng/mở như Drawer thực tế.
    if (state.phase === "error" && state.hash && !state.reverted) { setOpen(true); return; }
    setWantYield(false); setReloaded(false); setStep(scenario === "transaction" ? "transaction" : "permit");
    setState(scenario === "permit" || scenario === "transaction" ? { phase: "signing" }
      : scenario === "pending" ? { phase: "pending", hash: HASH }
      : scenario === "success" ? { phase: "success", hash: HASH }
      : scenario === "cancelled" ? { phase: "error", error: "Bạn đã hủy ký. Có thể thử lại khi sẵn sàng." }
      : scenario === "reverted" ? { phase: "error", hash: HASH, reverted: true, error: "Phòng đã có người gửi cọc trước. Đóng màn này và xem thông tin phòng mới." }
      : scenario === "unknown" || scenario === "unknownReserved" ? { phase: "error", hash: HASH, error: "Mất kết nối khi chờ xác nhận. Hãy kiểm tra lại kết quả." }
      : scenario === "long" ? { phase: "error", error: "KhôngThểXácNhận/".repeat(35) + " Bạn có thể thử lại." }
      : { phase: "idle" });
    setOpen(true);
  }
  function submit() {
    if (state.phase === "error" && state.hash && !state.reverted) {
      setState({ phase: "pending", hash: state.hash });
      timers.current.push(setTimeout(() => setState({ phase: "success", hash: HASH }), 900));
      return;
    }
    setStep("permit"); setState({ phase: "signing" });
    timers.current.push(setTimeout(() => {
      if (outcome === "cancel") { setState({ phase: "error", error: "Bạn đã hủy ký. Lựa chọn sinh lãi được giữ nguyên để thử lại." }); return; }
      setStep("transaction");
      timers.current.push(setTimeout(() => {
        setState({ phase: "pending", hash: HASH });
        timers.current.push(setTimeout(() => setState(outcome === "revert"
          ? { phase: "error", hash: HASH, reverted: true, error: "Giao dịch bị từ chối. Đóng và cập nhật thông tin phòng trước khi thử lại." }
          : { phase: "success", hash: HASH }), 900));
      }, 900));
    }, 900));
  }
  let deal = state.phase === "success" || scenario === "reserved" || scenario === "unknownReserved" ? { ...sample, onchain: { ...sample.onchain, state: "RESERVED" as const } } : sample;
  if (scenario === "zeroFee") deal = { ...deal, onchain: { ...deal.onchain, reserveFee: "0" } };
  if (scenario === "long") deal = { ...deal, terms: { ...deal.terms, room: { ...deal.terms.room, title: "Đặng Thị Mỹ Duyên — Phòng trên đường Nguyễn Hữu Phước ".repeat(7) } }, onchain: { ...deal.onchain, deposit: "999999999999999999999999", reserveFee: "99999999999999999999999" } };
  const blocked = scenario === "config" && !reloaded ? "Chưa tải được tỉ giá và hạn nhận phòng. Tải lại trước khi gửi cọc."
    : scenario === "expired" ? "Đã hết hạn gửi cọc. Bạn chưa thể tiếp tục với phòng này."
    : scenario === "reserved" || scenario === "unknownReserved" ? "Phòng này không còn nhận cọc. Đóng màn này để xem thông tin mới."
    : scenario === "stale" && !reloaded ? "Thông tin phòng đang cần cập nhật. Tải lại trước khi gửi cọc."
    : scenario === "wallet" ? "Chưa có ví. Đóng màn này và đăng nhập lại để gửi cọc." : null;
  const balanceState = !reloaded && scenario === "balanceError" ? "error" : !reloaded && scenario === "balanceLoading" ? "loading" : "ready";
  const balance = balanceState !== "ready" ? undefined : scenario === "unknownReserved" ? 0n : scenario === "short" && !reloaded ? 200000000n : scenario === "long" ? 999999999999999999999999n : 300000000n;
  return <PageShell size="read" className="space-y-6 py-8">
    <h1 className="text-2xl font-bold text-primary">Mẫu xác nhận gửi cọc</h1>
    <p>Chỉ kiểm tra giao diện với dữ liệu mẫu. Không ký, gửi giao dịch hay nhận tiền test thật.</p>
    <div className="space-y-2"><label htmlFor="preview-state" className="block font-semibold">Tình huống</label>
      <select id="preview-state" value={scenario} onChange={e => { setScenario(e.target.value); setState({ phase: "idle" }); }} className="min-h-12 w-full rounded-lg border border-input bg-background px-3">{Object.entries(options).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div>
    <div className="space-y-2"><label htmlFor="preview-outcome" className="block font-semibold">Kết quả khi bấm gửi cọc (mô phỏng)</label>
      <select id="preview-outcome" value={outcome} onChange={e => setOutcome(e.target.value)} className="min-h-12 w-full rounded-lg border border-input bg-background px-3"><option value="success">Thành công</option><option value="cancel">Hủy ký</option><option value="revert">Chuỗi từ chối</option></select></div>
    <Button id="open-deposit" size="lg" onClick={show}>Mở xác nhận cọc mẫu</Button>
    <DepositSheetView deal={deal} open={open} onOpenChange={setOpen} state={state} signingStep={step}
      rate={scenario === "config" && !reloaded ? null : 25000} deadline={scenario === "config" && !reloaded ? null : scenario === "expired" ? "2026-11-16T02:03:00Z" : "2026-11-20T02:03:00Z"}
      balance={balance} balanceState={balanceState} blocked={blocked} wantYield={wantYield} yieldAvailable={scenario === "yield"}
      feeBps={1000} onWantYield={setWantYield} onSubmit={submit} onReload={() => setReloaded(true)}
      faucet={<Button variant="secondary" className="w-full" onClick={() => setReloaded(true)}>Nhận tiền test (mẫu)</Button>} />
  </PageShell>;
}
