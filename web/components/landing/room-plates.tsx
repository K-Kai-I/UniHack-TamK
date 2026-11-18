// Hình vẽ nét cho 3 góc chụp (tường đầu giường, cửa, sàn), lúc nhận và lúc trả phòng.
// Dùng khi chưa có ảnh minh họa; luôn kèm nhãn "Hình vẽ minh họa" ở nơi hiển thị.
import type { Position } from "./data";

const INK = "var(--ink)";
const LINE = { fill: "none", stroke: INK, strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const THIN = { ...LINE, strokeWidth: 1.2, opacity: 0.45 } as const;

export function RoomPlate({ id, after = false, className }: { id: Position["id"]; after?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true">
      <rect width="400" height="300" fill="var(--muted)" />
      {id === "p1" && <Wall after={after} />}
      {id === "p2" && <Door after={after} />}
      {id === "p3" && <Floor />}
    </svg>
  );
}

function Wall({ after }: { after: boolean }) {
  return (
    <g>
      {/* góc tường bên phải, trần, chân tường */}
      <path d="M352 0 L352 236 L400 262" {...LINE} />
      <path d="M0 236 L352 236" {...THIN} />
      <path d="M352 18 L400 4" {...THIN} />
      {/* giường sắt + nệm */}
      <path d="M58 300 L58 206 L300 206 L300 300" {...LINE} />
      <path d="M58 222 L300 222" {...LINE} />
      <path d="M70 236 C120 228 240 228 290 236 L296 300 L64 300 Z" fill="var(--background)" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
      {/* ổ điện */}
      <rect x="318" y="196" width="20" height="26" rx="3" {...LINE} />
      <path d="M325 205 L325 211 M331 205 L331 211" {...LINE} />
      {/* vết cũ sẵn có gần chân tường */}
      <path d="M24 226 l10 -3 M120 230 l6 -2" {...THIN} />
      {after && (
        <g>
          <path
            d="M248 62 C262 44 300 46 316 60 C334 74 330 96 318 110 C306 124 312 140 296 146 C278 152 270 132 254 128 C236 122 230 104 236 88 C240 76 238 70 248 62 Z"
            fill="var(--warning-foreground)"
            opacity={0.32}
          />
          <path d="M300 146 C302 160 298 172 300 186" stroke="var(--warning-foreground)" strokeOpacity={0.4} strokeWidth={5} strokeLinecap="round" fill="none" />
        </g>
      )}
    </g>
  );
}

function Door({ after }: { after: boolean }) {
  return (
    <g>
      <path d="M0 262 L400 262" {...THIN} />
      {/* khung và cánh cửa */}
      <path d="M128 262 L128 22 L272 22 L272 262" {...LINE} />
      <rect x="138" y="32" width="124" height="230" fill={after ? "color-mix(in oklab, var(--accent) 70%, var(--background))" : "var(--accent)"} stroke={INK} strokeWidth={2.2} />
      <path d="M150 48 L250 48 L250 140 L150 140 Z M150 156 L250 156 L250 248 L150 248 Z" {...THIN} />
      {/* tay nắm tròn */}
      <circle cx="246" cy="152" r="7" {...LINE} />
      {/* công tắc */}
      <rect x="292" y="132" width="18" height="26" rx="3" {...LINE} />
      {after && (
        <g {...THIN} opacity={0.6}>
          <path d="M232 140 c4 -2 8 -1 10 2 M234 164 c3 2 7 2 10 0 M226 152 c-2 3 -2 6 0 8" />
          <path d="M160 252 c14 -3 30 -3 44 0" />
        </g>
      )}
    </g>
  );
}

function Floor() {
  // sàn gạch nhìn chéo: các đường dọc hội tụ về điểm tụ phía trên
  const vx = 200;
  const xs = [-200, -60, 80, 220, 360, 500, 640];
  const ys = [40, 92, 156, 236];
  return (
    <g>
      {xs.map((x) => <path key={x} d={`M${x} 300 L${vx + (x - vx) * 0.36} 0`} {...THIN} />)}
      {ys.map((y) => <path key={y} d={`M0 ${y} L400 ${y}`} {...THIN} />)}
      {/* chân giường góc trái trên, chân thang gác góc phải trên */}
      <path d="M22 0 L22 48 L96 48 L96 0" {...LINE} />
      <path d="M310 0 L304 70 M368 0 L374 70 M306 46 L372 46" {...LINE} />
      {/* vệt sáng cửa sổ trên gạch */}
      <path d="M150 180 L238 172 L250 210 L156 220 Z" fill="var(--background)" opacity={0.7} />
    </g>
  );
}
