"use client";

import { useEffect, useRef, useState } from "react";
import { ListingWizardView, UNRESOLVED_TX, type ListingPhase } from "@/components/listing-wizard";
import { emptyDraft, newKey, STEPS, type ListingDraft, type PhotoDraft } from "@/lib/client/listing-form";
import { isUnresolved, signOrResume, type CreateDealArgs, type CreateDealResult } from "@/lib/client/use-create-deal";
import type { TxState } from "@/lib/client/use-tx";

const HASH = `0x${"1".repeat(64)}` as const;

// Ảnh chẩn đoán tỉ lệ, không phải ảnh phòng và không gửi lên API.
function samplePhoto(portrait = false): PhotoDraft {
  const width = portrait ? 300 : 600, height = portrait ? 600 : 400;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ebe6f4"/><rect x="4" y="4" width="${width - 8}" height="${height - 8}" fill="none" stroke="#30254b" stroke-width="8"/><text x="50%" y="50%" text-anchor="middle" font-size="24" fill="#30254b">ẢNH KIỂM TRA</text></svg>`;
  return { id: newKey(), blob: new Blob([svg], { type: "image/svg+xml" }), previewUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`, capturedAt: "2026-11-17T02:00:00Z" };
}
function sample(scenario: string): ListingDraft {
  const draft = emptyDraft();
  if (scenario === "empty") return draft;
  const date = new Date(); date.setDate(date.getDate() + 2);
  const moveIn = date.toLocaleDateString("en-CA"); date.setMonth(date.getMonth() + 6);
  const leaseEnd = date.toLocaleDateString("en-CA");
  const photo = samplePhoto();
  return { ...draft, title: scenario === "long" ? "Đặng Thị Mỹ Duyên — Phòng trên đường Nguyễn Hữu Phước ".repeat(5) : "Phòng 20m² gần ĐH Bách Khoa",
    address: scenario === "long" ? "ĐịaChỉRấtDài/".repeat(25) : "268 Lý Thường Kiệt, Quận 10, TP. Hồ Chí Minh", rentVnd: "3000000",
    amenities: ["Máy lạnh", "Bếp"], photos: scenario === "max" ? Array.from({ length: 8 }, (_, i) => samplePhoto(i % 2 === 1)) : [photo, samplePhoto(true)],
    depositVnd: scenario === "long" ? "999999999999999999999999" : "6000000", reserveVnd: "500000", moveIn, leaseEnd,
    positions: Array.from({ length: scenario === "max" ? 10 : 3 }, (_, i) => ({ key: `sample-p${i}`, name: scenario === "long" ? "VịTríRấtDài".repeat(10) : ["Tường đầu giường", "Cửa ra vào", "Sàn nhà"][i % 3], instruction: "Đứng ở cửa, chụp ngang, giữ đủ bốn góc", photo: scenario === "missing" ? null : samplePhoto(i % 2 === 1) })),
    prices: Array.from({ length: scenario === "max" ? 20 : 3 }, (_, i) => ({ key: `sample-i${i}`, item: scenario === "long" ? "HạngMụcRấtDài".repeat(12) : ["Sơn lại 1 mảng tường", "Thay ổ khóa", "Thay 1 viên gạch"][i % 3], unit: "lần", priceVnd: "400000" })),
  };
}

export default function ListingPreview() {
  const [scenario, setScenario] = useState("ready");
  const [step, setStep] = useState(0);
  const [outcome, setOutcome] = useState("success");
  const [transaction, setTransaction] = useState<TxState>({ phase: "idle" });
  const [revision, setRevision] = useState(0);
  const [calls, setCalls] = useState(0);
  const [signs, setSigns] = useState(0);
  const resolved = useRef(false); // "unresolved": lần chờ lại sau đó thấy giao dịch thành công
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  function reset() { setTransaction({ phase: "idle" }); setCalls(0); setSigns(0); resolved.current = false; setRevision(n => n + 1); }
  // Cùng đường rẽ với màn thật (signOrResume): có hash chưa biết kết quả thì chờ lại, không ký lần hai.
  const demoArgs: CreateDealArgs = { deposit: "6000000", reserveFee: "500000", moveInDate: 0, leaseEnd: 1, yieldEnabled: false, termsHash: HASH };
  async function publish(_draft: ListingDraft, progress: (phase: ListingPhase) => void) {
    setCalls(n => n + 1);
    const pause = () => new Promise<void>(resolve => setTimeout(resolve, 750));
    progress({ name: "uploading", done: 0, total: 5 }); await pause();
    if (!active.current) return null;
    if (outcome === "uploadError") throw new Error("Chưa tải được ảnh. Kiểm tra kết nối rồi thử đăng lại. Ảnh và nội dung vẫn được giữ trong phiên này.");
    progress({ name: "terms" }); await pause();
    if (!active.current) return null;
    const fail: CreateDealResult = { ok: false, reverted: false };
    const res = await signOrResume(transaction, {
      createDeal: async () => {
        setSigns(n => n + 1); setTransaction({ phase: "signing" }); await pause();
        if (!active.current) return fail;
        if (outcome === "cancel") { setTransaction({ phase: "error", error: "Bạn đã hủy ký. Thử lại khi sẵn sàng." }); return fail; }
        setTransaction({ phase: "pending", hash: HASH }); await pause();
        if (!active.current) return fail;
        if (outcome === "revert") { setTransaction({ phase: "error", hash: HASH, reverted: true, error: "Giao dịch chưa thành công. Kiểm tra lại rồi thử đăng." }); return { ok: false, txHash: HASH, reverted: true }; }
        if (outcome === "unresolved" && !resolved.current) { setTransaction({ phase: "error", hash: HASH, error: "Mất kết nối khi chờ biên nhận." }); return { ok: false, txHash: HASH, reverted: false }; }
        setTransaction({ phase: "success", hash: HASH });
        return { ok: true, dealId: 12n, txHash: HASH };
      },
      resumeDeal: async hash => {
        setTransaction({ phase: "pending", hash }); await pause();
        if (!active.current) return fail;
        resolved.current = true;
        setTransaction({ phase: "success", hash });
        return { ok: true, dealId: 12n, txHash: hash };
      },
    }, demoArgs, kind => progress({ name: kind === "check" ? "checking" : "signing" }));
    if (!res.ok) {
      if (isUnresolved(res)) throw new Error(UNRESOLVED_TX);
      return null;
    }
    progress({ name: "confirming" }); await pause();
    return 12;
  }
  return <>
    <div className="flex flex-wrap items-center gap-3 border-b bg-muted p-4 text-sm">
      <p className="w-full">Mẫu UI task 08 · Ảnh chẩn đoán, dữ liệu mô phỏng. Không gọi API hay ký giao dịch thật.</p>
      <label htmlFor="preview-state">Tình huống</label>
      <select id="preview-state" value={scenario} onChange={e => { setScenario(e.target.value); reset(); }} className="min-h-12 max-w-full rounded-lg border border-input bg-background px-3">
        {Object.entries({ ready: "Đã điền mẫu", empty: "Form trống", long: "Nội dung dài", max: "8 ảnh / 10 vị trí / 20 dòng", missing: "Thiếu ảnh ví dụ", login: "Chưa đăng nhập", loading: "Đang tải tài khoản" }).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <label htmlFor="preview-step">Bước mẫu</label>
      <select id="preview-step" value={step} onChange={e => { setStep(Number(e.target.value)); reset(); }} className="min-h-12 max-w-full rounded-lg border border-input bg-background px-3">
        {STEPS.map((s, i) => <option key={s.id} value={i}>{i + 1}. {s.label}</option>)}
      </select>
      <label htmlFor="preview-outcome">Kết quả mô phỏng</label>
      <select id="preview-outcome" value={outcome} onChange={e => { setOutcome(e.target.value); setTransaction({ phase: "idle" }); resolved.current = false; }} className="min-h-12 max-w-full rounded-lg border border-input bg-background px-3">
        <option value="success">Thành công</option><option value="uploadError">Lỗi tải ảnh</option><option value="cancel">Hủy ký</option><option value="revert">Giao dịch lỗi</option><option value="unresolved">Mất mạng sau khi gửi</option>
      </select>
      <output id="preview-calls">Lần gửi mẫu: {calls}</output>
      <output id="preview-signs">Lần ký mẫu: {signs}</output>
    </div>
    <ListingWizardView key={`${scenario}:${step}:${revision}`} ready={scenario !== "loading"} authenticated={scenario !== "login"}
      onLogin={() => { setScenario("ready"); reset(); }} initialDraft={() => sample(scenario)} initialStep={step}
      vndPerToken={25000} transaction={transaction} onPublish={publish} onDraftChange={() => setTransaction({ phase: "idle" })} />
  </>;
}
