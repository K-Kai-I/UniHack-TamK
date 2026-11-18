// Trạng thái + kiểm tra form "Đăng phòng" (docs/user-flow.md GĐ1). Chỉ là dữ liệu NHẬP; mọi hash do API tính.
// Từ 19/11 chủ trọ KHÔNG chọn ngày: người thuê chọn ngày khi gửi yêu cầu thuê, chủ trọ duyệt rồi mới ký lên chuỗi.
// Chủ trọ nhập tiền bằng VND; khi gửi thì đổi sang Amount (mUSDC, 6 số lẻ) theo vndPerToken.
import { parseVndInput, vndToAmount } from "./money";

export const MAX_LISTING_PHOTOS = 8;
export const MIN_POSITIONS = 3; // data-contract: 3 đến 10 vị trí
export const MAX_POSITIONS = 10;
export const MAX_PRICE_ITEMS = 20; // TODO(spec): spec chưa nói tối đa bao nhiêu dòng bảng giá; tạm 20.

/** Số tiền VND tối đa mỗi ô nhập (100 tỷ). Giữ giá thuê an toàn khi đổi sang number và chặn gõ nhầm thừa số 0. */
export const MAX_VND = 100_000_000_000n;
const TOO_BIG = "Số tiền quá lớn. Nhập tối đa 100.000.000.000 ₫.";

export interface PhotoDraft {
  id: string; // khóa React ổn định: chụp lại ảnh không đổi id nên ô ảnh và hộp thoại không bị dựng lại
  blob: Blob;
  previewUrl: string; // object URL, phải revoke khi bỏ ảnh
  capturedAt: string;
}

export interface PositionDraft {
  key: string; // khóa React; id thật (p1, p2...) do API đánh
  name: string;
  instruction: string;
  photo: PhotoDraft | null;
}

export interface PriceDraft {
  key: string;
  item: string;
  unit: string;
  priceVnd: string;
}

export interface ListingDraft {
  title: string;
  address: string;
  rentVnd: string;
  amenities: string[];
  photos: PhotoDraft[];
  depositVnd: string;
  reserveVnd: string;
  yieldEnabled: boolean;
  moveIn: string; // yyyy-mm-dd
  leaseEnd: string;
  positions: PositionDraft[];
  prices: PriceDraft[];
}

let seq = 0;
export const newKey = () => `k${++seq}`;

export function emptyDraft(): ListingDraft {
  return {
    title: "",
    address: "",
    rentVnd: "",
    amenities: [],
    photos: [],
    depositVnd: "",
    reserveVnd: "",
    yieldEnabled: false,
    moveIn: "",
    leaseEnd: "",
    // Gợi ý sẵn 3 vị trí tối thiểu cho chủ trọ khỏi gõ từ đầu; sửa/xóa/thêm tự do.
    positions: [
      { key: newKey(), name: "Tường đầu giường", instruction: "Đứng ở cửa, chụp ngang", photo: null },
      { key: newKey(), name: "Cửa ra vào", instruction: "Đứng giữa phòng, chụp thẳng cửa", photo: null },
      { key: newKey(), name: "Sàn nhà", instruction: "Đứng ở cửa, chụp chéo xuống sàn", photo: null },
    ],
    prices: [
      { key: newKey(), item: "Sơn lại 1 mảng tường", unit: "mảng", priceVnd: "" },
      { key: newKey(), item: "Thay ổ khóa cửa", unit: "cái", priceVnd: "" },
      { key: newKey(), item: "Thay 1 viên gạch sàn", unit: "viên", priceVnd: "" },
    ],
  };
}

export const STEPS = [
  { id: "info", label: "Thông tin" },
  { id: "money", label: "Tiền" },
  { id: "positions", label: "Vị trí chụp" },
  { id: "prices", label: "Bảng giá" },
  { id: "review", label: "Xem lại" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

export type Errors = Record<string, string>;

/** yyyy-mm-dd của hôm nay theo giờ máy (cho thuộc tính min của ô ngày). */
export function todayInput(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Kiểm tra từng bước. Rỗng = hợp lệ. Khóa lỗi: tên trường, hoặc `positions.<key>`, `prices.<key>`. */
export function validateStep(step: StepId, d: ListingDraft): Errors {
  const e: Errors = {};
  if (step === "info") {
    if (d.title.trim().length < 5) e.title = "Nhập tiêu đề ít nhất 5 ký tự.";
    if (d.address.trim().length < 5) e.address = "Nhập địa chỉ đầy đủ.";
    const rent = parseVndInput(d.rentVnd);
    if (rent === null || rent <= 0n) e.rentVnd = "Nhập giá thuê mỗi tháng.";
    else if (rent > MAX_VND) e.rentVnd = TOO_BIG;
    if (d.photos.length < 1) e.photos = "Chụp ít nhất 1 ảnh phòng.";
  }
  if (step === "money") {
    const dep = parseVndInput(d.depositVnd);
    const res = parseVndInput(d.reserveVnd);
    if (dep === null || dep <= 0n) e.depositVnd = "Nhập tiền cọc lớn hơn 0.";
    else if (dep > MAX_VND) e.depositVnd = TOO_BIG;
    if (res === null) e.reserveVnd = "Nhập phí giữ chỗ (có thể là 0).";
    else if (res > MAX_VND) e.reserveVnd = TOO_BIG;
    else if (dep !== null && res > dep) e.reserveVnd = "Phí giữ chỗ không được lớn hơn tiền cọc.";
  }
  if (step === "positions") {
    if (d.positions.length < MIN_POSITIONS) e.positions = `Cần ít nhất ${MIN_POSITIONS} vị trí.`;
    for (const p of d.positions) {
      if (!p.name.trim()) e[`positions.${p.key}`] = "Đặt tên vị trí.";
      else if (!p.instruction.trim()) e[`positions.${p.key}`] = "Ghi cách đứng chụp.";
      else if (!p.photo) e[`positions.${p.key}`] = "Chụp ảnh ví dụ cho vị trí này.";
    }
  }
  if (step === "prices") {
    if (d.prices.length < 1) e.prices = "Thêm ít nhất 1 dòng bảng giá.";
    for (const it of d.prices) {
      const v = parseVndInput(it.priceVnd);
      if (!it.item.trim() || !it.unit.trim()) e[`prices.${it.key}`] = "Nhập tên hạng mục và đơn vị.";
      else if (v === null || v <= 0n) e[`prices.${it.key}`] = "Nhập đơn giá lớn hơn 0.";
      else if (v > MAX_VND) e[`prices.${it.key}`] = TOO_BIG;
    }
  }
  return e;
}

/** Bước đầu tiên còn lỗi (để chặn đăng khi chưa đủ), hoặc null. */
export function firstInvalidStep(d: ListingDraft): StepId | null {
  for (const s of STEPS) if (s.id !== "review" && Object.keys(validateStep(s.id, d)).length) return s.id;
  return null;
}

/** Ngày yyyy-mm-dd → ISO UTC lúc 02:00Z (= 09:00 giờ VN), khớp ví dụ trong data-contract. */
export const dateToIso = (ymd: string) => `${ymd}T02:00:00Z`;

/** Body của POST /rooms (docs/api-contract.md): như POST /listings nhưng không có `dates`.
 *  `ids` là kết quả POST /uploads đã làm trước đó. */
export function buildListingBody(
  d: ListingDraft,
  vndPerToken: number,
  ids: { listing: string[]; example: Record<string, string> },
) {
  const vnd = (s: string) => vndToAmount(parseVndInput(s)!, vndPerToken);
  return {
    room: {
      title: d.title.trim(),
      address: d.address.trim(),
      rentVnd: Number(parseVndInput(d.rentVnd)!), // rentVnd là số nguyên VND thường, không phải Amount
      amenities: d.amenities,
    },
    listingPhotoIds: ids.listing,
    money: { depositAmount: vnd(d.depositVnd), reserveFeeAmount: vnd(d.reserveVnd) },
    positions: d.positions.map((p) => ({
      name: p.name.trim(),
      instruction: p.instruction.trim(),
      examplePhotoId: ids.example[p.key],
    })),
    priceList: d.prices.map((it) => ({ item: it.item.trim(), unit: it.unit.trim(), priceAmount: vnd(it.priceVnd) })),
    yieldEnabled: d.yieldEnabled,
  };
}
