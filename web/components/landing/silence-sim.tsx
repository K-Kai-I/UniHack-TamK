"use client";
// "Nếu ai đó im lặng?": chọn một nhánh sau khi trả phòng, dải tiền đi theo đúng luật hết hạn của contract
// (docs/contract-spec.md: proposeWindow, respondWindow, juryWindow; bảng Chia tiền).
import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { EXAMPLE, WINDOWS, vnd } from "./data";
import s from "./landing.module.css";

type Branch = "landlord" | "tenant" | "dispute";
const COUNTER = 150_000;

const BRANCHES: Record<Branch, {
  label: string;
  silent: 0 | 1 | null; // đoạn nào đứt: 0 = Trả phòng→Đề xuất, 1 = Đề xuất→Chia tiền
  middle: string;
  rule: string;
  tenant: number;
  note: string;
}> = {
  landlord: {
    label: "Chủ trọ không đề xuất",
    silent: 0,
    middle: "Không có đề xuất",
    rule: `Trả phòng xong, chủ trọ có ${WINDOWS.propose} để đề xuất mức trừ. Hết hạn mà im lặng: coi như trừ 0 ₫.`,
    tenant: EXAMPLE.deposit,
    note: "Người thuê nhận lại đủ cọc.",
  },
  tenant: {
    label: "Người thuê không phản hồi",
    silent: 1,
    middle: `Đề xuất trừ ${vnd(EXAMPLE.deduction)}`,
    rule: `Có đề xuất, người thuê có ${WINDOWS.respond} để đồng ý hoặc kháng nghị. Hết hạn mà im lặng: chia theo đề xuất.`,
    tenant: EXAMPLE.deposit - EXAMPLE.deduction,
    note: "Tiền chia theo mức chủ trọ đề xuất.",
  },
  dispute: {
    label: "Người thuê kháng nghị",
    silent: null,
    middle: `Đề xuất ${vnd(EXAMPLE.deduction)} · kháng nghị ${vnd(COUNTER)}`,
    rule: `Bồi thẩm chọn một trong hai con số, không tự đặt số mới. Con dấu AI tính là một phiếu. Bên nào đủ 2 phiếu thì thắng. Hết ${WINDOWS.jury} chưa đủ phiếu: theo mức AI.`,
    tenant: EXAMPLE.deposit - EXAMPLE.deduction,
    note: `Kết quả là ${vnd(EXAMPLE.deposit - EXAMPLE.deduction)} hoặc ${vnd(EXAMPLE.deposit - COUNTER)} cho người thuê, tùy phiếu.`,
  },
};

function useCountdown(seconds: number, key: string) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    const t = setInterval(() => setLeft((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [seconds, key]);
  const h = String(Math.floor(left / 3600)).padStart(2, "0");
  const m = String(Math.floor((left % 3600) / 60)).padStart(2, "0");
  const sec = String(left % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

export function SilenceSim() {
  const [branch, setBranch] = useState<Branch>("landlord");
  const b = BRANCHES[branch];
  const clock = useCountdown(23 * 3600 + 59 * 60 + 59, branch);
  const name = useId();
  const landlord = EXAMPLE.deposit - b.tenant;
  const W = 40;
  const tw = (W * b.tenant) / EXAMPLE.deposit;
  const lw = (W * landlord) / EXAMPLE.deposit;
  const seg = (i: 0 | 1) => (b.silent === i
    ? { stroke: "var(--track)", strokeDasharray: "10 12", strokeWidth: 10 }
    : { stroke: "var(--ink)", strokeDasharray: "none", strokeWidth: W });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-12">
      <fieldset className="min-w-0 space-y-3">
        <legend className="mb-3 text-sm font-semibold text-muted-foreground">Chọn điều xảy ra sau khi trả phòng</legend>
        {(Object.keys(BRANCHES) as Branch[]).map((k) => (
          <label
            key={k}
            className={cn(
              "flex min-h-16 cursor-pointer items-center gap-4 rounded-xl border px-5 text-lg font-bold transition-colors",
              k === branch ? "border-primary bg-secondary text-primary" : "border-input hover:bg-muted",
            )}
          >
            <input type="radio" name={name} value={k} checked={k === branch} onChange={() => setBranch(k)} className="size-5 shrink-0 accent-primary" />
            {BRANCHES[k].label}
          </label>
        ))}
      </fieldset>

      <div className="min-w-0 space-y-6" aria-live="polite">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-5xl font-extrabold tracking-[-0.04em] tabular-nums sm:text-7xl" aria-hidden="true">{clock}</span>
          <span className="text-muted-foreground">đồng hồ minh họa, hạn thật là {b.silent === 1 ? WINDOWS.respond : b.silent === 0 ? WINDOWS.propose : WINDOWS.jury}</span>
        </div>

        {/* desktop: dải ngang có nhãn; điện thoại: dải gọn, nhãn đọc bằng danh sách bên dưới */}
        <svg viewBox="0 0 900 250" className="hidden h-auto w-full overflow-visible sm:block" role="img" aria-label={`${b.label}. ${b.note}`}>
          <path d="M0 90 L300 90" fill="none" className={s.seg} style={seg(0)} />
          <path d="M300 90 L560 90" fill="none" className={s.seg} style={seg(1)} />
          <path d="M560 90 C680 90 700 70 900 70" fill="none" stroke="var(--keep)" className={s.split} style={{ strokeWidth: Math.max(tw, 0.01), opacity: tw > 0 ? 1 : 0 }} />
          <path d="M560 90 C680 90 700 180 900 180" fill="none" stroke="var(--ink)" className={s.split} style={{ strokeWidth: Math.max(lw, 0.01), opacity: lw > 0 ? 1 : 0 }} />
          {[0, 300, 560].map((x) => <circle key={x} cx={x} cy={90} r={11} fill="var(--fold)" stroke="var(--background)" strokeWidth={4} />)}
          <text x={0} y={150} className={s.svgLabel} fontSize={25} fontWeight={800}>Trả phòng</text>
          <text x={300} y={150} className={s.svgLabel} fontSize={25} fontWeight={800}>{b.silent === 0 ? "Im lặng tới hạn" : "Đề xuất"}</text>
          <text x={300} y={182} className={s.svgMuted} fontSize={21}>{b.middle}</text>
          <text x={560} y={150} className={s.svgLabel} fontSize={25} fontWeight={800}>{b.silent === 1 ? "Im lặng tới hạn" : "Chia tiền"}</text>
          <text x={900} y={28} textAnchor="end" className={s.svgLabel} fontSize={26} fontWeight={800} style={{ fill: "var(--keep)" }}>{vnd(b.tenant)} · người thuê</text>
          <text x={900} y={226} textAnchor="end" className={s.svgLabel} fontSize={23} fontWeight={700}>{vnd(landlord)} · chủ trọ</text>
        </svg>
        <div className="space-y-4 sm:hidden">
          <svg viewBox="0 0 360 120" className="h-auto w-full overflow-visible" aria-hidden="true">
            <path d="M0 50 L110 50" fill="none" className={s.seg} style={{ ...seg(0), strokeWidth: b.silent === 0 ? 6 : 22 }} />
            <path d="M110 50 L210 50" fill="none" className={s.seg} style={{ ...seg(1), strokeWidth: b.silent === 1 ? 6 : 22 }} />
            <path d="M210 50 C260 50 270 30 360 30" fill="none" stroke="var(--keep)" className={s.split} style={{ strokeWidth: Math.max((22 * b.tenant) / EXAMPLE.deposit, 0.01) }} />
            <path d="M210 50 C260 50 270 100 360 100" fill="none" stroke="var(--ink)" className={s.split} style={{ strokeWidth: Math.max((22 * landlord) / EXAMPLE.deposit, 0.01), opacity: landlord > 0 ? 1 : 0 }} />
            {[0, 110, 210].map((x) => <circle key={x} cx={x} cy={50} r={7} fill="var(--fold)" stroke="var(--background)" strokeWidth={3} />)}
          </svg>
          <ol className="space-y-1 text-sm">
            <li><span className="font-bold">1. Trả phòng</span></li>
            <li><span className="font-bold">2. {b.silent === 0 ? "Im lặng tới hạn" : "Đề xuất"}</span> <span className="text-muted-foreground">· {b.middle}</span></li>
            <li><span className="font-bold">3. {b.silent === 1 ? "Im lặng tới hạn rồi chia tiền" : "Chia tiền"}</span></li>
          </ol>
          <dl className="grid grid-cols-2 gap-3">
            <div><dt className="text-sm text-muted-foreground">Người thuê</dt><dd className="text-xl font-extrabold whitespace-nowrap text-success tabular-nums">{vnd(b.tenant)}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Chủ trọ</dt><dd className="text-xl font-extrabold whitespace-nowrap tabular-nums">{vnd(landlord)}</dd></div>
          </dl>
        </div>

        <div className="space-y-2 border-t pt-5">
          <p className="text-xl font-bold text-pretty">{b.note}</p>
          <p className="max-w-[62ch] text-muted-foreground">{b.rule}</p>
          <p className="text-sm text-muted-foreground">Quá hạn thì ai cũng bấm “Xử lý quá hạn” được, và bot của app cũng tự bấm định kỳ. Không ai phải đi đòi.</p>
        </div>
      </div>
    </div>
  );
}
