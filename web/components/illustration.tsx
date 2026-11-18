import { cn } from "@/lib/utils";

/**
 * Hai minh họa duy nhất của app (hướng A, task 20): "chuẩn bị/nhận phòng" và "bàn giao".
 * Cùng nét: viền 3px màu primary, mảng phẳng, một điểm nhấn hổ phách, không người, không bóng.
 * Chỉ đặt ở màn chào và trạng thái trống/hướng dẫn. KHÔNG dùng ở nơi cần ảnh phòng hay bằng chứng;
 * luôn kèm nhãn "Minh họa" để không ai nhầm với ảnh thật.
 */
const KINDS = {
  checkin: "Minh họa: căn phòng được chụp ảnh theo từng vị trí, kèm danh sách kiểm tra khi nhận phòng",
  handover: "Minh họa: chìa khóa được bàn giao, tiền cọc nằm trong két chờ đến lúc trả phòng",
} as const;

export type IllustrationKind = keyof typeof KINDS;

export function Illustration({ kind, className }: { kind: IllustrationKind; className?: string }) {
  return (
    <figure className={cn("w-full max-w-60 space-y-1.5", className)}>
      <svg
        viewBox="0 0 240 160"
        role="img"
        aria-label={KINDS[kind]}
        className="block h-auto w-full stroke-primary [stroke-linecap:round] [stroke-linejoin:round]"
        fill="none"
        strokeWidth={3}
      >
        {kind === "checkin" ? <Checkin /> : <Handover />}
      </svg>
      <figcaption className="text-center text-xs text-muted-foreground">Minh họa, không phải ảnh phòng thật</figcaption>
    </figure>
  );
}

function Checkin() {
  return (
    <>
      <path d="M16 132H224" />
      {/* Căn phòng: tường, cửa sổ, giường */}
      <rect x="32" y="28" width="164" height="104" rx="8" className="fill-secondary" />
      <rect x="48" y="46" width="44" height="38" rx="4" className="fill-background" />
      <path d="M70 46V84M48 65H92" strokeWidth={2} />
      <rect x="108" y="96" width="76" height="36" rx="4" className="fill-accent" />
      <rect x="114" y="84" width="24" height="12" rx="5" className="fill-background" />
      {/* Khung ngắm: ảnh chụp theo từng vị trí */}
      <path d="M40 52V38H54M174 38H188V52M40 116V130H54M174 130H188V116" className="stroke-warning" strokeWidth={5} />
      {/* Danh sách kiểm tra */}
      <rect x="168" y="44" width="56" height="64" rx="6" className="fill-background" />
      <path d="M177 61l4 4 7-8M177 78l4 4 7-8M177 95l4 4 7-8" strokeWidth={2.5} />
      <path d="M194 61H215M194 78H215M194 95H208" strokeWidth={2.5} />
    </>
  );
}

function Handover() {
  return (
    <>
      <path d="M16 132H224" />
      {/* Cửa phòng */}
      <rect x="24" y="32" width="52" height="100" rx="4" className="fill-secondary" />
      <circle cx="64" cy="84" r="3.5" className="fill-primary" />
      {/* Đường đi của chìa khóa */}
      <path d="M80 60Q124 26 168 50" strokeWidth={2.5} strokeDasharray="2 8" />
      {/* Chìa khóa */}
      <circle cx="106" cy="92" r="13" className="fill-warning" />
      <circle cx="106" cy="92" r="4" className="fill-background" strokeWidth={2.5} />
      <path d="M119 92H152M140 92V102M149 92V100" />
      {/* Két giữ cọc */}
      <path d="M182 68V56a14 14 0 0 1 28 0V68" />
      <rect x="172" y="68" width="48" height="64" rx="6" className="fill-accent" />
      <path d="M185 100l7 7 14-15" strokeWidth={3.5} />
    </>
  );
}
