"use client";
// Dải tiền chạy dọc cột trái của phần hành trình. Đường đi đo từ vị trí các mốc thật trong DOM,
// nên nội dung dài/ngắn thế nào dải vẫn đi qua đúng từng mốc.
// Đầu dải luôn bám vạch 72% chiều cao màn hình: cuộn tới mốc nào, dải vừa tới mốc đó.
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";

interface Geo { d: string; h: number; w: number; stroke: number; tenant?: string; landlord?: string; share: number }

const LINE = 0.72; // vị trí đầu dải, tính theo chiều cao màn hình

function buildPath(points: { x: number; y: number }[], top: number, bottom: number) {
  if (points.length === 0) return "";
  const first = points[0];
  let d = `M${first.x} ${top} L${first.x} ${first.y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const mid = (a.y + b.y) / 2;
    d += ` C${a.x} ${mid} ${b.x} ${mid} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1];
  return d + ` L${last.x} ${bottom}`;
}

/** share: phần của người thuê (0..1), để tách dải ở cuối đúng tỉ lệ tiền. */
export function JourneyRail({ children, share = 1 }: { children: ReactNode; share?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const track = useRef<SVGPathElement>(null);
  // bảng tra: phần dải đã vẽ (0..1) tại từng độ cao y, lấy mẫu từ chính đường path
  const table = useRef<{ y: number; f: number }[]>([]);
  const [geo, setGeo] = useState<Geo | null>(null);
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const target = useMotionValue(0);
  const progress = useSpring(target, { stiffness: 160, damping: 32, restDelta: 0.0005 });
  const splitTarget = useMotionValue(0);
  const split = useSpring(splitTarget, { stiffness: 90, damping: 24, restDelta: 0.001 });
  // Chưa tới điểm tách thì hai nhánh ẩn hẳn (theo đích, không theo lò xo), để không còn chấm sót lại.
  const splitOpacity = useTransform(splitTarget, (v) => (v > 0 ? 1 : 0));

  const update = useCallback(() => {
    const root = ref.current;
    const rows = table.current;
    if (!root || rows.length === 0) return;
    const line = window.innerHeight * LINE - root.getBoundingClientRect().top;
    let f = 0;
    for (const r of rows) { if (r.y > line) break; f = r.f; }
    target.set(f);
    splitTarget.set(f >= 0.995 ? 1 : 0);
  }, [target, splitTarget]);

  useMotionValueEvent(scrollY, "change", update);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const box = root.getBoundingClientRect();
      const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-rail-node]"));
      nodes.forEach((n) => { n.style.translate = ""; });
      const wide = window.matchMedia("(min-width: 768px)").matches;
      const swing = wide ? 14 : 4;
      const points = nodes.map((n, i) => {
        const r = n.getBoundingClientRect();
        const cx = r.left - box.left + r.width / 2;
        return { x: cx + (i % 2 === 0 ? -swing : swing), y: r.top - box.top + r.height / 2 };
      });
      // mốc tròn nằm giữa dải: dời mốc theo đúng độ lệch của đường đi
      nodes.forEach((n, i) => { n.style.translate = `${i % 2 === 0 ? -swing : swing}px 0`; });
      const stroke = wide ? 40 : 14;
      let d = buildPath(points, 0, points.length ? points[points.length - 1].y : box.height);
      let tenant: string | undefined, landlord: string | undefined;
      // Sau mốc cuối: dải rẽ ngang vào vùng [data-rail-end] rồi tách thành phần mỗi bên.
      const end = root.querySelector<HTMLElement>("[data-rail-end]");
      const last = points[points.length - 1];
      if (end && last) {
        const r = end.getBoundingClientRect();
        const y = r.top - box.top + r.height * 0.45;
        const R = wide ? 56 : 28;
        const sx = r.left - box.left + r.width * (wide ? 0.3 : 0.32);
        const ex = r.right - box.left;
        const lift = wide ? 34 : 18;
        d += ` L${last.x} ${y - R} Q${last.x} ${y} ${last.x + R} ${y} L${sx} ${y}`;
        tenant = `M${sx} ${y} C${sx + (ex - sx) * 0.35} ${y} ${sx + (ex - sx) * 0.45} ${y - lift} ${ex} ${y - lift}`;
        landlord = `M${sx} ${y} C${sx + (ex - sx) * 0.35} ${y} ${sx + (ex - sx) * 0.45} ${y + lift * 2.4} ${ex} ${y + lift * 2.4}`;
      }
      setGeo({ d, h: box.height, w: box.width, stroke, tenant, landlord, share });
    };
    measure();
    // font và ảnh tải xong làm các mốc dời chỗ: đo lại
    document.fonts?.ready.then(measure);
    window.addEventListener("load", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => { ro.disconnect(); window.removeEventListener("load", measure); };
  }, [share]);

  // Path đã có trong DOM: lấy mẫu để tra chiều dài theo độ cao (đường đi luôn đi xuống).
  useLayoutEffect(() => {
    const p = track.current;
    if (!p || !geo) return;
    const total = p.getTotalLength();
    const steps = 240;
    const rows: { y: number; f: number }[] = [];
    for (let i = 0; i <= steps; i++) rows.push({ y: p.getPointAtLength((total * i) / steps).y, f: i / steps });
    table.current = rows;
    update();
  }, [geo, update]);

  return (
    <div ref={ref} className="relative">
      {geo && (
        <svg className="pointer-events-none absolute inset-0" width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden="true">
          <path ref={track} d={geo.d} fill="none" stroke="var(--track)" strokeWidth={2} strokeDasharray="2 8" strokeLinecap="round" />
          <motion.path
            d={geo.d}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={geo.stroke}
            style={{ pathLength: reduce ? 1 : progress }}
          />
          {geo.tenant && (
            <motion.path d={geo.tenant} fill="none" stroke="var(--keep)" strokeWidth={geo.stroke * geo.share} strokeLinecap="butt" style={{ pathLength: reduce ? 1 : split, opacity: reduce ? 1 : splitOpacity }} />
          )}
          {geo.landlord && geo.share < 1 && (
            <motion.path d={geo.landlord} fill="none" stroke="var(--ink)" strokeWidth={Math.max(3, geo.stroke * (1 - geo.share))} strokeLinecap="butt" style={{ pathLength: reduce ? 1 : split, opacity: reduce ? 1 : splitOpacity }} />
          )}
        </svg>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
