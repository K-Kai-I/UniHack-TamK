// Khung hình đầu: dải tiền cọc đi vào, gập ở từng mốc, tách ở cuối theo đúng tỉ lệ tiền.
import type { CSSProperties } from "react";
import { AuthCta } from "./auth";
import { EXAMPLE, vnd } from "./data";
import s from "./landing.module.css";

const d = (delay: number, dur?: number) => ({ "--delay": `${delay}s`, ...(dur ? { "--dur": `${dur}s` } : {}) }) as CSSProperties;

// Độ dày dải tỉ lệ với số tiền: 6.000.000 ₫ = 56 đơn vị.
const W = 56;
const TENANT_W = Math.round((W * (EXAMPLE.deposit - EXAMPLE.deduction)) / EXAMPLE.deposit);
const LANDLORD_W = Math.max(3, Math.round((W * EXAMPLE.deduction) / EXAMPLE.deposit));

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className={`${s.wrap} relative grid gap-6 pt-8 pb-4 md:pb-10 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:items-start md:gap-4 md:pt-16 lg:grid-cols-[minmax(0,33rem)_minmax(0,1fr)]`}>
      <div className="relative z-10 space-y-6 md:pt-6">
        <h1 id="hero-title" className="text-[2.6rem] leading-[1.02] font-extrabold tracking-[-0.04em] text-balance text-primary sm:text-6xl lg:text-[4.75rem]">
          Luôn biết tiền cọc của bạn đang ở đâu.
        </h1>
        <p className="max-w-[30rem] text-lg text-muted-foreground lg:text-xl">
          Cọc nằm trong một hợp đồng tự động, không nằm trong tay ai. Mỗi khoản trừ có ảnh và giá chốt sẵn. Mỗi bước có hạn chót.
        </p>
        <div id="hero-cta" className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <AuthCta className="min-h-16 px-8 text-lg" />
          <a href="#hanh-trinh" className="inline-flex min-h-12 items-center justify-center rounded-lg px-4 font-semibold text-primary underline-offset-4 hover:underline">
            Xem tiền đi qua từng mốc
          </a>
        </div>
        <p className="text-sm text-muted-foreground">
          <span data-when-guest>Đăng nhập bằng Google là dùng được, không cần cài thêm gì.</span>
          <br />
          <strong className="font-semibold text-foreground">Bản thử nghiệm:</strong> chỉ dùng tiền thử.
        </p>
      </div>

      <figure className="relative -mx-[var(--gutter)] md:mx-0 md:-mt-16">
        <figcaption className="sr-only">
          Ví dụ minh họa, {EXAMPLE.room}: gửi cọc {vnd(EXAMPLE.deposit)} ngày {EXAMPLE.moveIn}, nhận phòng với 3 ảnh, ở 6 tháng,
          trả phòng bị đề xuất trừ {vnd(EXAMPLE.deduction)} theo bảng giá. Người thuê nhận lại {vnd(EXAMPLE.deposit - EXAMPLE.deduction)}, chủ trọ nhận {vnd(EXAMPLE.deduction)}.
        </figcaption>
        <DesktopRibbon />
        <MobileRibbon />
      </figure>
    </section>
  );
}

function Fold({ x, y, delay, r = 11 }: { x: number; y: number; delay: number; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill="var(--fold)" stroke="var(--background)" strokeWidth={4} className={s.appear} style={d(delay)} />;
}

function DesktopRibbon() {
  return (
    <svg viewBox="0 0 900 880" className="hidden h-auto w-full md:block" aria-hidden="true">
      {/* 6.000.000 ₫ đi vào, gập ở Gửi cọc, tới Nhận phòng */}
      <path d="M300 -40 C300 60 520 70 520 170 C520 270 230 250 230 360" pathLength={1} fill="none" stroke="var(--ink)" strokeWidth={W} className={s.draw} style={d(0.15, 1.0)} />
      {/* 6 tháng ở: nét đứt = đang chờ, tiền nằm yên trong hợp đồng */}
      <path d="M230 360 C230 470 560 470 560 600" fill="none" stroke="var(--track)" strokeWidth={W} strokeDasharray="10 12" className={s.appear} style={d(0.95)} />
      {/* Trả phòng: tách theo đúng tỉ lệ tiền, mỗi nhánh dừng ở số tiền của mình */}
      <path d="M560 600 C560 690 330 700 330 780" pathLength={1} fill="none" stroke="var(--keep)" strokeWidth={TENANT_W} strokeLinecap="round" className={s.draw} style={d(1.45, 0.8)} />
      <path d="M560 600 C560 690 712 700 712 780" pathLength={1} fill="none" stroke="var(--ink)" strokeWidth={LANDLORD_W} strokeLinecap="round" className={s.draw} style={d(1.55, 0.8)} />

      <Fold x={520} y={170} delay={0.45} />
      <Fold x={230} y={360} delay={0.8} />
      <Fold x={560} y={600} delay={1.3} />

      <g className={s.appear} style={d(0.5)}>
        <text x={572} y={164} className={s.svgLabel} fontSize={26} fontWeight={800}>Gửi cọc · {vnd(EXAMPLE.deposit)}</text>
        <text x={572} y={194} className={s.svgMuted} fontSize={18}>{EXAMPLE.moveIn} · đã khóa trong hợp đồng</text>
      </g>
      <g className={s.appear} style={d(0.85)}>
        <text x={282} y={354} className={s.svgLabel} fontSize={26} fontWeight={800}>Nhận phòng</text>
        <text x={282} y={384} className={s.svgMuted} fontSize={18}>3 ảnh: tường, cửa, sàn</text>
      </g>
      <g className={s.appear} style={d(1.05)}>
        <text x={385} y={516} textAnchor="end" className={s.svgLabel} fontSize={21} fontWeight={700}>6 tháng ở</text>
        <text x={385} y={542} textAnchor="end" className={s.svgMuted} fontSize={18}>tiền nằm yên, không ai đụng được</text>
      </g>
      <g className={s.appear} style={d(1.35)}>
        <text x={612} y={594} className={s.svgLabel} fontSize={26} fontWeight={800}>Trả phòng</text>
        <text x={612} y={624} className={s.svgMuted} fontSize={18}>trừ {vnd(EXAMPLE.deduction)} · có ảnh, có giá</text>
      </g>
      <g className={s.appear} style={d(1.9)}>
        <text x={330} y={844} textAnchor="middle" className={s.svgLabel} fontSize={30} fontWeight={800} style={{ fill: "var(--keep)" }}>{vnd(EXAMPLE.deposit - EXAMPLE.deduction)}</text>
        <text x={330} y={870} textAnchor="middle" className={s.svgMuted} fontSize={18}>về người thuê</text>
        <text x={712} y={844} textAnchor="middle" className={s.svgLabel} fontSize={26} fontWeight={800}>{vnd(EXAMPLE.deduction)}</text>
        <text x={712} y={870} textAnchor="middle" className={s.svgMuted} fontSize={18}>về chủ trọ</text>
      </g>
    </svg>
  );
}

function MobileRibbon() {
  const w = 30;
  const tw = Math.round((w * (EXAMPLE.deposit - EXAMPLE.deduction)) / EXAMPLE.deposit);
  return (
    <svg viewBox="0 0 390 660" className="block h-auto w-full md:hidden" aria-hidden="true">
      <path d="M62 -20 C62 40 92 60 92 110 C92 190 50 200 50 260" pathLength={1} fill="none" stroke="var(--ink)" strokeWidth={w} className={s.draw} style={d(0.1, 0.9)} />
      <path d="M50 260 C50 340 92 360 92 430" fill="none" stroke="var(--track)" strokeWidth={w} strokeDasharray="8 9" className={s.appear} style={d(0.8)} />
      <path d="M92 430 C92 520 62 530 62 610" pathLength={1} fill="none" stroke="var(--keep)" strokeWidth={tw} strokeLinecap="round" className={s.draw} style={d(1.2, 0.8)} />
      <path d="M92 430 C92 510 220 510 232 586" pathLength={1} fill="none" stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" className={s.draw} style={d(1.3, 0.8)} />
      <Fold x={92} y={110} delay={0.35} r={8} />
      <Fold x={50} y={260} delay={0.65} r={8} />
      <Fold x={92} y={430} delay={1.1} r={8} />
      <g className={s.appear} style={d(0.4)}>
        <text x={128} y={106} className={s.svgLabel} fontSize={19} fontWeight={800}>Gửi cọc · {vnd(EXAMPLE.deposit)}</text>
        <text x={128} y={128} className={s.svgMuted} fontSize={14}>{EXAMPLE.moveIn} · đã khóa trong hợp đồng</text>
      </g>
      <g className={s.appear} style={d(0.7)}>
        <text x={90} y={256} className={s.svgLabel} fontSize={19} fontWeight={800}>Nhận phòng</text>
        <text x={90} y={278} className={s.svgMuted} fontSize={14}>3 ảnh: tường, cửa, sàn</text>
      </g>
      <g className={s.appear} style={d(0.9)}>
        <text x={110} y={350} className={s.svgLabel} fontSize={16} fontWeight={700}>6 tháng ở · tiền nằm yên</text>
      </g>
      <g className={s.appear} style={d(1.15)}>
        <text x={128} y={426} className={s.svgLabel} fontSize={19} fontWeight={800}>Trả phòng</text>
        <text x={128} y={448} className={s.svgMuted} fontSize={14}>trừ {vnd(EXAMPLE.deduction)} · có ảnh, có giá</text>
      </g>
      <g className={s.appear} style={d(1.7)}>
        <text x={250} y={584} className={s.svgLabel} fontSize={17} fontWeight={800}>{vnd(EXAMPLE.deduction)}</text>
        <text x={250} y={604} className={s.svgMuted} fontSize={13}>về chủ trọ</text>
        <text x={100} y={632} className={s.svgLabel} fontSize={21} fontWeight={800} style={{ fill: "var(--keep)" }}>{vnd(EXAMPLE.deposit - EXAMPLE.deduction)}</text>
        <text x={100} y={654} className={s.svgMuted} fontSize={14}>về người thuê · ví dụ minh họa</text>
      </g>
    </svg>
  );
}
