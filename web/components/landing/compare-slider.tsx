"use client";
// Kéo để so ảnh lúc nhận phòng và lúc trả phòng. AI khoanh hư hỏng mới, đóng con dấu, ra mức trừ theo bảng giá.
// Điều khiển bằng <input type="range"> nên dùng được bằng bàn phím và trình đọc màn hình.
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { POSITIONS, VERDICT_LABEL, vnd, type Position } from "./data";
import { RoomPlate } from "./room-plates";
import s from "./landing.module.css";

export function CompareSlider({ photos }: { photos: Record<string, boolean> }) {
  const [active, setActive] = useState<Position["id"]>("p1");
  const [pos, setPos] = useState(88);
  const frame = useRef<HTMLDivElement>(null);
  const played = useRef(false);
  const id = useId();
  const p = POSITIONS.find((x) => x.id === active)!;
  const total = POSITIONS.reduce((sum, x) => sum + x.vnd, 0);

  // Lần đầu cuộn tới: tự kéo một lượt để người xem thấy cách dùng, rồi trả quyền cho người dùng.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || played.current) return;
      played.current = true;
      io.disconnect();
      if (reduce) { setPos(40); return; }
      const start = performance.now();
      const from = 88, to = 40, dur = 1400;
      const tick = (t: number) => {
        const k = Math.min(1, (t - start) / dur);
        const eased = 1 - Math.pow(1 - k, 4);
        setPos(from + (to - from) * eased);
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const hasPhotos = photos[`${active}-checkin`] && photos[`${active}-checkout`];
  // Con dấu chỉ đóng khi thanh kéo đã lộ phần ảnh có hư hỏng (hoặc quá nửa khung nếu không có vết nào).
  const isStamped = pos < (p.mark ? p.mark.x - p.mark.r / 2 : 55);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
      <div className="min-w-0 space-y-3">
        <div role="tablist" aria-label="Vị trí chụp" className="flex flex-wrap gap-2">
          {POSITIONS.map((x) => (
            <button
              key={x.id}
              role="tab"
              id={`${id}-${x.id}`}
              aria-selected={x.id === active}
              aria-controls={`${id}-panel`}
              onClick={() => { setActive(x.id); setPos(45); }}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors",
                x.id === active ? "border-primary bg-primary text-primary-foreground" : "border-input text-foreground hover:bg-secondary",
              )}
            >
              {x.name}
            </button>
          ))}
        </div>

        <div
          ref={frame}
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-${active}`}
          className={cn(s.compare, "relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted select-none")}
        >
          {hasPhotos ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/landing/${active}-checkout.webp`} alt={`${p.name}, lúc trả phòng`} className="absolute inset-0 size-full object-contain" draggable={false} />
              <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/landing/${active}-checkin.webp`} alt={`${p.name}, lúc nhận phòng`} className="absolute inset-0 size-full object-contain" draggable={false} />
              </div>
            </>
          ) : (
            <div role="img" aria-label={`Hình vẽ minh họa ${p.name}: bên trái lúc nhận phòng, bên phải lúc trả phòng`} className="absolute inset-0">
              <RoomPlate id={active} after className="absolute inset-0 size-full" />
              <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
                <RoomPlate id={active} className="absolute inset-0 size-full" />
              </div>
            </div>
          )}

          {p.mark && pos < p.mark.x + p.mark.r && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute rounded-full border-[3px] border-warning shadow-[0_0_0_3px_rgb(255_255_255/0.7)]"
              style={{ left: `${p.mark.x - p.mark.r}%`, top: `${p.mark.y - p.mark.r * 1.33}%`, width: `${p.mark.r * 2}%`, height: `${p.mark.r * 2.66}%` }}
            />
          )}

          <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold">Lúc nhận phòng</span>
          <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold">Lúc trả phòng</span>
          <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground">{hasPhotos ? "Ảnh minh họa" : "Hình vẽ minh họa"}</span>

          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 bg-background" style={{ left: `${pos}%` }}>
            <span className={cn(s.handle, "absolute top-1/2 left-1/2 grid size-12 -translate-1/2 place-items-center rounded-full bg-background text-primary shadow-[0_2px_10px_rgb(36_31_48/0.25)]")}>
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6" /></svg>
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(pos)}
            aria-label={`So ảnh ${p.name}: kéo sang trái để xem ảnh lúc trả phòng`}
            aria-valuetext={`Hiện ${Math.round(pos)}% ảnh lúc nhận phòng`}
            onChange={(e) => {
              const v = Number(e.target.value);
              setPos(v);
            }}
          />

          <div className="pointer-events-none absolute right-4 bottom-4 sm:right-6 sm:bottom-6">
            <Seal amount={p.vnd} pressed={!!isStamped} key={`${active}-${isStamped ? 1 : 0}`} />
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-5 lg:pt-14" aria-live="polite">
        <div className="space-y-2">
          <p className={cn("inline-flex rounded-full px-3 py-1 text-sm font-semibold", p.verdict === "NEW_DAMAGE" ? "bg-warning text-warning-foreground" : "bg-secondary text-secondary-foreground")}>
            {VERDICT_LABEL[p.verdict]}
          </p>
          <p className="text-lg font-semibold text-pretty">{p.finding}</p>
          <p className="text-sm text-muted-foreground">Chụp: {p.instruction.toLowerCase()}.</p>
        </div>
        <dl className="divide-y border-y">
          {POSITIONS.map((x) => (
            <div key={x.id} className={cn("flex items-baseline justify-between gap-4 py-3", x.id === active && "font-semibold")}>
              <dt className="min-w-0">
                {x.name}
                <span className="block text-sm font-normal text-muted-foreground">{x.priceItem ?? VERDICT_LABEL[x.verdict]}</span>
              </dt>
              <dd className="shrink-0 tabular-nums">{vnd(x.vnd)}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 py-3 text-lg font-extrabold">
            <dt>AI đề xuất trừ</dt>
            <dd className="tabular-nums">{vnd(total)}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">
          AI chỉ trả kết luận và hạng mục bảng giá. Số tiền do bảng giá nhân lên. Ảnh mờ, tối, sai góc thì AI trả “không rõ”, không đoán.
        </p>
      </div>
    </div>
  );
}

/** Con dấu AI: kết luận đã ký, gắn với đúng bộ ảnh này. */
function Seal({ amount, pressed }: { amount: number; pressed: boolean }) {
  return (
    <svg viewBox="0 0 140 140" className={cn("size-24 sm:size-32", s.stamp, pressed ? s.stampPressed : s.stampIdle)} aria-hidden="true">
      <defs>
        <path id="seal-arc" d="M70 70 m-50 0 a50 50 0 1 1 100 0 a50 50 0 1 1 -100 0" />
      </defs>
      <circle cx="70" cy="70" r="66" fill="rgb(255 255 255 / 0.88)" stroke="currentColor" strokeWidth="3" />
      <circle cx="70" cy="70" r="40" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text fontSize="11.5" fontWeight="700" letterSpacing="2.2" fill="currentColor" fontFamily="var(--font-sans)">
        <textPath href="#seal-arc">CON DẤU AI · ĐÃ KÝ · KÉT CỌC TRỌ ·</textPath>
      </text>
      <text x="70" y="66" textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor" fontFamily="var(--font-sans)">đề xuất trừ</text>
      <text x="70" y="84" textAnchor="middle" fontSize={amount >= 100000 ? 15 : 20} fontWeight="800" fill="currentColor" fontFamily="var(--font-sans)">{vnd(amount)}</text>
    </svg>
  );
}
