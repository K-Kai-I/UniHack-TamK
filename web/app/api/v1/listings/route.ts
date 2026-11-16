// POST /api/v1/listings và GET /api/v1/listings?state=OPEN: docs/api-contract.md.
// POST dựng file điều khoản kct.terms/1 (docs/data-contract.md), trả termsHash và tham số createDeal.
import { addresses } from "@/lib/chain";
import { hashJson } from "@/lib/hash";
import { requireWallet } from "@/lib/server/auth";
import { readDeals } from "@/lib/server/chain";
import { env } from "@/lib/server/env";
import { ApiErr, json, photoUrl, readJson, route } from "@/lib/server/http";
import { getPhotoMetas, insertListing, listBoundListings } from "@/lib/server/repo";
import { DEAL_STATES, type Address, type DealState, type PhotoRef, type Terms } from "@/lib/types";

interface Body {
  room?: { title?: string; address?: string; rentVnd?: number; amenities?: string[] };
  listingPhotoIds?: string[];
  money?: { depositAmount?: string; reserveFeeAmount?: string };
  dates?: { moveInDate?: string; leaseEnd?: string };
  positions?: { name?: string; instruction?: string; examplePhotoId?: string }[];
  priceList?: { item?: string; unit?: string; priceAmount?: string }[];
  yieldEnabled?: boolean;
}

const bad = (m: string) => new ApiErr("BAD_REQUEST", m);
const isAmount = (v: unknown): v is string => typeof v === "string" && /^\d{1,30}$/.test(v);
const text = (v: unknown, field: string, max = 300) => {
  if (typeof v !== "string" || !v.trim()) throw bad(`Thiếu ${field}`);
  if (v.length > max) throw bad(`${field} quá dài`);
  return v.trim();
};
const iso = (v: unknown, field: string) => {
  const d = new Date(String(v));
  if (!v || Number.isNaN(d.getTime())) throw bad(`${field} không phải ISO 8601`);
  return d;
};

export const POST = route(async (req: Request) => {
  const landlord = await requireWallet(req);
  const b = await readJson<Body>(req);

  // ---- tiền và ngày
  const deposit = b.money?.depositAmount;
  const reserve = b.money?.reserveFeeAmount;
  if (!isAmount(deposit) || BigInt(deposit) === BigInt(0)) throw bad("depositAmount phải là số nguyên dương (chuỗi)");
  if (!isAmount(reserve)) throw bad("reserveFeeAmount phải là số nguyên (chuỗi)");
  if (BigInt(reserve) > BigInt(deposit)) throw bad("Phí giữ chỗ không được lớn hơn tiền cọc");
  const moveIn = iso(b.dates?.moveInDate, "moveInDate");
  const leaseEnd = iso(b.dates?.leaseEnd, "leaseEnd");
  if (leaseEnd <= moveIn) throw bad("Ngày hết hợp đồng phải sau ngày dọn vào");

  // ---- vị trí chụp và bảng giá
  const positions = b.positions ?? [];
  if (positions.length < 3 || positions.length > 10) throw bad("Cần từ 3 đến 10 vị trí chụp");
  const prices = b.priceList ?? [];
  if (prices.length > 100) throw bad("Bảng giá tối đa 100 dòng");

  // ---- ảnh: phải tồn tại, do chính chủ trọ tải lên, đúng mục đích
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

  const terms: Terms = {
    schema: "kct.terms/1",
    createdAt: new Date().toISOString(),
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
    dates: { moveInDate: moveIn.toISOString(), leaseEnd: leaseEnd.toISOString() },
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

  const termsHash = hashJson(terms);
  const listingId = await insertListing(landlord, terms, termsHash);
  return json(
    {
      listingId,
      termsHash,
      terms,
      createDealArgs: {
        deposit,
        reserveFee: reserve,
        moveInDate: Math.floor(moveIn.getTime() / 1000),
        leaseEnd: Math.floor(leaseEnd.getTime() / 1000),
        yieldEnabled: terms.yieldEnabled,
        termsHash,
      },
    },
    201,
  );
});

export const GET = route(async (req: Request) => {
  const stateParam = (new URL(req.url).searchParams.get("state") ?? "OPEN").toUpperCase();
  if (!(DEAL_STATES as readonly string[]).includes(stateParam)) throw bad(`state phải là một trong ${DEAL_STATES.join(", ")}`);

  const rows = await listBoundListings();
  const deals = await readDeals(rows.map((r) => BigInt(r.deal_id!)));
  const items = rows
    .map((r, i) => ({ r, d: deals[i] }))
    .filter(({ d }) => d.stateName === (stateParam as DealState))
    .map(({ r, d }) => ({
      listingId: r.id,
      dealId: Number(r.deal_id),
      title: r.terms.room.title,
      address: r.terms.room.address,
      rentVnd: r.terms.room.rentVnd,
      amenities: r.terms.room.amenities,
      depositAmount: d.deposit.toString(),
      reserveFeeAmount: d.reserveFee.toString(),
      moveInDate: new Date(Number(d.moveInDate) * 1000).toISOString(),
      coverUrl: r.terms.listingPhotos[0] ? photoUrl(req, r.terms.listingPhotos[0].photoId) : null,
      landlord: d.landlord,
    }));
  return json({ items });
});
