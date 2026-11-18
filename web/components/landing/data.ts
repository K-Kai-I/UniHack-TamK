// Dữ liệu minh họa cho landing. Khớp shared/samples/terms.json và report.damage.json
// (cọc 240 token × 25.000 = 6.000.000 ₫; mục i1 = 16 token = 400.000 ₫).
// Đây là ví dụ, không phải hợp đồng thật: mọi nơi hiển thị đều ghi "Ví dụ minh họa".

export const EXAMPLE = {
  room: "Phòng 20m² gần ĐH Bách Khoa",
  address: "Quận 10, TP.HCM",
  deposit: 6_000_000,
  deduction: 400_000,
  moveIn: "20/11",
  leaseEnd: "20/05",
} as const;

export const PRICE_LIST = [
  { id: "i1", item: "Sơn lại 1 mảng tường", unit: "mảng", vnd: 400_000 },
  { id: "i2", item: "Thay ổ khóa cửa", unit: "cái", vnd: 300_000 },
  { id: "i3", item: "Thay 1 viên gạch sàn", unit: "viên", vnd: 100_000 },
] as const;

export type Verdict = "NEW_DAMAGE" | "WEAR" | "NO_CHANGE";

export interface Position {
  id: "p1" | "p2" | "p3";
  name: string;
  instruction: string;
  verdict: Verdict;
  finding: string;
  priceItem: string | null;
  vnd: number;
  /** Vị trí vết hư hỏng trên ảnh (phần trăm), để AI khoanh. null = không khoanh. */
  mark: { x: number; y: number; r: number } | null;
}

export const POSITIONS: readonly Position[] = [
  {
    id: "p1",
    name: "Tường đầu giường",
    instruction: "Đứng ở cửa, chụp ngang",
    verdict: "NEW_DAMAGE",
    finding: "Vết ố nâu lớn ở góc phải, không có trong ảnh nhận phòng.",
    priceItem: "Sơn lại 1 mảng tường × 1",
    vnd: 400_000,
    mark: { x: 65, y: 28, r: 11 },
  },
  {
    id: "p2",
    name: "Cửa ra vào",
    instruction: "Đứng giữa phòng, chụp thẳng cửa",
    verdict: "WEAR",
    finding: "Cửa bạc màu đều, vài vết tay quanh tay nắm. Hao mòn tự nhiên sau 6 tháng ở.",
    priceItem: null,
    vnd: 0,
    mark: null,
  },
  {
    id: "p3",
    name: "Sàn nhà",
    instruction: "Đứng ở cửa, chụp chéo xuống sàn",
    verdict: "NO_CHANGE",
    finding: "Sàn không thay đổi.",
    priceItem: null,
    vnd: 0,
    mark: null,
  },
];

export const VERDICT_LABEL: Record<Verdict, string> = {
  NEW_DAMAGE: "Hư hỏng mới",
  WEAR: "Hao mòn tự nhiên",
  NO_CHANGE: "Không thay đổi",
};

/** Hạn thật theo docs/contract-spec.md (bản demo tính bằng phút). */
export const WINDOWS = { propose: "1 ngày", respond: "1 ngày", jury: "1 ngày" } as const;

export const vnd = (n: number) => n.toLocaleString("vi-VN") + " ₫";

/**
 * Ảnh đã có trong web/public/landing/ (webp). Thêm tên vào đây khi chép ảnh vào.
 * Không dò file bằng fs: trên Vercel, lúc trang làm mới phía server không thấy thư mục public/.
 * Ví dụ: "p1-checkin", "p1-checkout", "team/khai".
 */
export const LANDING_PHOTOS: readonly string[] = [
  "p1-checkin", "p1-checkout", "p2-checkin", "p2-checkout", "p3-checkin", "p3-checkout",
];
export const hasPhoto = (name: string) => LANDING_PHOTOS.includes(name);
