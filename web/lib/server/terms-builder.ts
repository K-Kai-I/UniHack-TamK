// Dựng file điều khoản kct.terms/1 (docs/data-contract.md) từ dữ liệu chủ trọ nhập.
// Dùng chung cho POST /listings (đăng phòng có sẵn ngày) và luồng yêu cầu thuê (POST /rooms rồi duyệt yêu cầu:
// ngày do người thuê chọn được ghép vào lúc chủ trọ duyệt).
import "server-only";
import { addresses } from "../chain";
import type { Address, Hash, PhotoRef, Terms } from "../types";
import { env } from "./env";
import { ApiErr } from "./http";
import { getPhotoMetas } from "./repo";

export interface RoomBody {
  room?: { title?: string; address?: string; rentVnd?: number; amenities?: string[] };
  listingPhotoIds?: string[];
  money?: { depositAmount?: string; reserveFeeAmount?: string };
  positions?: { name?: string; instruction?: string; examplePhotoId?: string }[];
  priceList?: { item?: string; unit?: string; priceAmount?: string }[];
  yieldEnabled?: boolean;
}

/** Điều khoản chưa có ngày: phần chủ trọ đăng một lần cho một căn phòng. */
export type RoomTemplate = Omit<Terms, "createdAt" | "dates">;

export const bad = (m: string) => new ApiErr("BAD_REQUEST", m);
const isAmount = (v: unknown): v is string => typeof v === "string" && /^\d{1,30}$/.test(v);
export const text = (v: unknown, field: string, max = 300) => {
  if (typeof v !== "string" || !v.trim()) throw bad(`Thiếu ${field}`);
  if (v.length > max) throw bad(`${field} quá dài`);
  return v.trim();
};
export const iso = (v: unknown, field: string) => {
  const d = new Date(String(v));
  if (!v || Number.isNaN(d.getTime())) throw bad(`${field} không phải ISO 8601`);
  return d;
};

/** Kiểm tra và dựng phần điều khoản không có ngày. Ảnh phải có thật, do chính chủ trọ tải lên, đúng mục đích. */
export async function buildRoomTemplate(landlord: Address, b: RoomBody): Promise<RoomTemplate> {
  const deposit = b.money?.depositAmount;
  const reserve = b.money?.reserveFeeAmount;
  if (!isAmount(deposit) || BigInt(deposit) === BigInt(0)) throw bad("depositAmount phải là số nguyên dương (chuỗi)");
  if (!isAmount(reserve)) throw bad("reserveFeeAmount phải là số nguyên (chuỗi)");
  if (BigInt(reserve) > BigInt(deposit)) throw bad("Phí giữ chỗ không được lớn hơn tiền cọc");

  const positions = b.positions ?? [];
  if (positions.length < 3 || positions.length > 10) throw bad("Cần từ 3 đến 10 vị trí chụp");
  const prices = b.priceList ?? [];
  if (prices.length > 100) throw bad("Bảng giá tối đa 100 dòng");

  const listingIds = b.listingPhotoIds ?? [];
  if (listingIds.length > 20) throw bad("Tối đa 20 ảnh đăng tin");
  const exampleIds = positions.map((p, i) => text(p.examplePhotoId, `ảnh ví dụ của vị trí ${i + 1}`, 100));
  const metas = await getPhotoMetas([...listingIds, ...exampleIds]);
  const ref = (id: string, purpose: "listing" | "example"): PhotoRef => {
    const m = metas.get(id);
    if (!m) throw new ApiErr("NOT_FOUND", `Không có ảnh ${id}`);
    if (m.owner !== landlord) throw new ApiErr("FORBIDDEN", `Ảnh ${id} không phải của bạn`);
    if (m.purpose !== purpose) throw bad(`Ảnh ${id} được tải lên với purpose=${m.purpose}, cần ${purpose}`);
    return { photoId: id, sha256: m.sha256 };
  };

  return {
    schema: "kct.terms/1",
    landlord,
    room: {
      title: text(b.room?.title, "tên phòng", 200),
      address: text(b.room?.address, "địa chỉ", 300),
      rentVnd: Math.max(0, Math.floor(Number(b.room?.rentVnd ?? 0))),
      amenities: (b.room?.amenities ?? []).filter((a) => typeof a === "string" && a.trim()).map((a) => a.trim()).slice(0, 30),
    },
    listingPhotos: listingIds.map((id) => ref(id, "listing")),
    money: {
      token: addresses.token.toLowerCase() as Address,
      decimals: 6,
      depositAmount: deposit,
      reserveFeeAmount: reserve,
      vndPerToken: env.vndPerToken,
    },
    positions: positions.map((p, i) => ({
      id: `p${i + 1}`,
      name: text(p.name, `tên vị trí ${i + 1}`),
      instruction: text(p.instruction, `cách chụp vị trí ${i + 1}`, 500),
      examplePhoto: ref(exampleIds[i], "example"),
    })),
    priceList: prices.map((it, i) => {
      if (!isAmount(it.priceAmount)) throw bad(`Đơn giá dòng ${i + 1} phải là số nguyên (chuỗi)`);
      return { id: `i${i + 1}`, item: text(it.item, `hạng mục dòng ${i + 1}`), unit: text(it.unit, `đơn vị dòng ${i + 1}`, 50), priceAmount: it.priceAmount };
    }),
    yieldEnabled: Boolean(b.yieldEnabled),
  };
}

/** Kiểm tra cặp ngày: hợp lệ, hết hạn sau ngày dọn vào. */
export function checkDates(moveIn: Date, leaseEnd: Date): void {
  if (leaseEnd <= moveIn) throw bad("Ngày hết hợp đồng phải sau ngày dọn vào");
}

/** Ghép ngày vào điều khoản. Giữ đúng thứ tự trường của kct.terms/1 (hash không phụ thuộc thứ tự, nhưng dễ đọc). */
export function termsWithDates(t: RoomTemplate, moveIn: Date, leaseEnd: Date): Terms {
  checkDates(moveIn, leaseEnd);
  return {
    schema: t.schema,
    createdAt: new Date().toISOString(),
    landlord: t.landlord,
    room: t.room,
    listingPhotos: t.listingPhotos,
    money: t.money,
    dates: { moveInDate: moveIn.toISOString(), leaseEnd: leaseEnd.toISOString() },
    positions: t.positions,
    priceList: t.priceList,
    yieldEnabled: t.yieldEnabled,
  };
}

/** Tham số createDeal theo docs/api-contract.md: frontend dùng nguyên, không tự đổi ngày sang giây. */
export function createDealArgsOf(terms: Terms, termsHash: Hash) {
  return {
    deposit: terms.money.depositAmount,
    reserveFee: terms.money.reserveFeeAmount,
    moveInDate: Math.floor(new Date(terms.dates.moveInDate).getTime() / 1000),
    leaseEnd: Math.floor(new Date(terms.dates.leaseEnd).getTime() / 1000),
    yieldEnabled: terms.yieldEnabled,
    termsHash,
  };
}
