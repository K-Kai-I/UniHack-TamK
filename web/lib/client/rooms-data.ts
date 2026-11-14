// DỮ LIỆU GIẢ cho màn "Phòng đang trống" và "Chi tiết phòng" (GĐ2).
// Hình dạng khớp docs/api-contract.md > GET /listings?state=OPEN và GET /deals/:dealId.
// Khi API của Khải xong: đổi thân hai hàm fetchOpenListings / fetchDeal sang apiFetch, UI giữ nguyên.
import type { Address, Amount, DealState, IsoTime, Terms } from "@/lib/types";

// TODO(spec): web/lib/types.ts chưa có kiểu cho response của GET /listings và GET /deals/:dealId.
// Khai báo tạm theo docs/api-contract.md; khi nhóm chốt thì chuyển sang types.ts.
export interface ListingItem {
  listingId: string;
  dealId: number;
  title: string;
  address: string;
  rentVnd: number;
  depositAmount: Amount;
  reserveFeeAmount: Amount;
  moveInDate: IsoTime;
  coverUrl: string | null;
  landlord: Address;
  amenities: string[]; // TODO(spec): GET /listings chưa trả amenities; cần cho thẻ danh sách
}

export interface DealDetail {
  dealId: number;
  onchain: { state: DealState; landlord: Address; tenant: Address | null; deposit: Amount; reserveFee: Amount };
  terms: Terms;
  // TODO(spec): Terms chỉ có photoId + sha256, không có URL ảnh. Cần API trả url cho ảnh đăng tin và ảnh ví dụ.
  listingPhotoUrls: string[];
  examplePhotoUrls: Record<string, string | null>; // theo positionId
}

// TODO(spec): tỉ giá lấy từ GET /config (vndPerToken). Tạm hằng số, trùng VND_PER_TOKEN trong .env.example.
export const MOCK_VND_PER_TOKEN = 25000;

export class NotFoundError extends Error {}

const A = (n: string) => `0x${n.repeat(40).slice(0, 40)}` as Address;
const H = (n: string) => `0x${n.repeat(64).slice(0, 64)}` as `0x${string}`;
const ph = (id: string) => ({ photoId: id, sha256: H("1") });

const WALL_SAMPLE_TERMS: Terms = {
  schema: "kct.terms/1",
  createdAt: "2026-11-14T03:00:00Z",
  landlord: A("1"),
  room: {
    title: "Phòng 20m2 gần ĐH Bách Khoa",
    address: "268 Lý Thường Kiệt, Quận 10, TP.HCM",
    rentVnd: 3_000_000,
    amenities: ["Máy lạnh", "Tủ lạnh"],
  },
  listingPhotos: [ph("ph_listing_01"), ph("ph_listing_02")],
  money: {
    token: A("0"),
    decimals: 6,
    depositAmount: "240000000",
    reserveFeeAmount: "20000000",
    vndPerToken: MOCK_VND_PER_TOKEN,
  },
  dates: { moveInDate: "2026-11-20T02:00:00Z", leaseEnd: "2027-05-20T02:00:00Z" },
  positions: [
    { id: "p1", name: "Tường đầu giường", instruction: "Đứng ở cửa, chụp ngang", examplePhoto: ph("ph_example_01") },
    { id: "p2", name: "Cửa ra vào", instruction: "Đứng giữa phòng, chụp thẳng cửa", examplePhoto: ph("ph_example_02") },
    { id: "p3", name: "Sàn nhà", instruction: "Đứng ở cửa, chụp chéo xuống sàn", examplePhoto: ph("ph_example_03") },
  ],
  priceList: [
    { id: "i1", item: "Sơn lại 1 mảng tường", unit: "mảng", priceAmount: "16000000" },
    { id: "i2", item: "Thay ổ khóa cửa", unit: "cái", priceAmount: "12000000" },
    { id: "i3", item: "Thay 1 viên gạch sàn", unit: "viên", priceAmount: "4000000" },
  ],
  yieldEnabled: false,
};

function deal(
  dealId: number,
  patch: {
    state?: DealState;
    tenant?: Address | null;
    room: Partial<Terms["room"]>;
    money?: Partial<Terms["money"]>;
    dates?: Terms["dates"];
    landlord?: Address;
    positions?: Terms["positions"];
    priceList?: Terms["priceList"];
    photos?: number;
  },
): DealDetail {
  const landlord = patch.landlord ?? WALL_SAMPLE_TERMS.landlord;
  const terms: Terms = {
    ...WALL_SAMPLE_TERMS,
    landlord,
    room: { ...WALL_SAMPLE_TERMS.room, ...patch.room },
    money: { ...WALL_SAMPLE_TERMS.money, ...patch.money },
    dates: patch.dates ?? WALL_SAMPLE_TERMS.dates,
    positions: patch.positions ?? WALL_SAMPLE_TERMS.positions,
    priceList: patch.priceList ?? WALL_SAMPLE_TERMS.priceList,
    listingPhotos: Array.from({ length: patch.photos ?? 0 }, (_, i) => ph(`ph_${dealId}_${i}`)),
  };
  return {
    dealId,
    onchain: {
      state: patch.state ?? "OPEN",
      landlord,
      tenant: patch.tenant ?? null,
      deposit: terms.money.depositAmount,
      reserveFee: terms.money.reserveFeeAmount,
    },
    terms,
    // Chưa có ảnh thật: để rỗng, UI vẽ khung giữ chỗ. Khi API có url thì điền vào đây.
    listingPhotoUrls: [],
    examplePhotoUrls: Object.fromEntries(terms.positions.map((p) => [p.id, null])),
  };
}

// 5 phòng OPEN (đủ trường hợp: bình thường, tên dài, không tiện nghi, tiền lẻ, ngày xa) + 1 phòng đã có người cọc.
const DEALS: DealDetail[] = [
  deal(12, { room: {}, photos: 2 }),
  deal(13, {
    room: {
      title: "Studio full nội thất, ban công thoáng, cách ĐH Kinh tế 5 phút đi bộ",
      address: "45/7 Nguyễn Đình Chiểu, Phường 6, Quận 3, TP.HCM",
      rentVnd: 4_500_000,
      amenities: ["Máy lạnh", "Máy giặt", "Tủ lạnh", "Bếp từ", "Ban công", "Gửi xe miễn phí"],
    },
    money: { depositAmount: "360000000", reserveFeeAmount: "30000000" },
    dates: { moveInDate: "2026-11-25T02:00:00Z", leaseEnd: "2027-11-25T02:00:00Z" },
    landlord: A("2"),
    photos: 4,
  }),
  deal(14, {
    room: {
      title: "Phòng trọ giá rẻ Thủ Đức",
      address: "12 Võ Văn Ngân, TP. Thủ Đức",
      rentVnd: 1_800_000,
      amenities: [],
    },
    money: { depositAmount: "72000000", reserveFeeAmount: "7500000" },
    dates: { moveInDate: "2026-12-01T02:00:00Z", leaseEnd: "2027-06-01T02:00:00Z" },
    landlord: A("3"),
    positions: WALL_SAMPLE_TERMS.positions.slice(0, 3),
    photos: 0,
  }),
  deal(15, {
    state: "RESERVED",
    tenant: A("9"),
    room: { title: "Phòng gác lửng đã có người cọc", address: "88 Cách Mạng Tháng 8, Quận 3", rentVnd: 3_200_000 },
    landlord: A("4"),
    photos: 1,
  }),
  deal(16, {
    room: {
      title: "Phòng 25m2 có gác, gần chợ Bến Thành",
      address: "9 Lê Thị Riêng, Quận 1, TP.HCM",
      rentVnd: 6_000_000,
      amenities: ["Máy lạnh", "Gác lửng"],
    },
    money: { depositAmount: "480000000", reserveFeeAmount: "40000000" },
    dates: { moveInDate: "2027-01-05T02:00:00Z", leaseEnd: "2027-07-05T02:00:00Z" },
    landlord: A("5"),
    photos: 3,
  }),
];

function toListing(d: DealDetail): ListingItem {
  return {
    listingId: `ls_mock_${d.dealId}`,
    dealId: d.dealId,
    title: d.terms.room.title,
    address: d.terms.room.address,
    rentVnd: d.terms.room.rentVnd,
    depositAmount: d.terms.money.depositAmount,
    reserveFeeAmount: d.terms.money.reserveFeeAmount,
    moveInDate: d.terms.dates.moveInDate,
    coverUrl: d.listingPhotoUrls[0] ?? null,
    landlord: d.terms.landlord,
    amenities: d.terms.room.amenities,
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Giả GET /listings?state=OPEN: chỉ trả deal OPEN, giống API thật. */
export async function fetchOpenListings(): Promise<ListingItem[]> {
  await delay(500);
  return DEALS.filter((d) => d.onchain.state === "OPEN").map(toListing);
}

/** Giả GET /deals/:dealId. Ném NotFoundError khi không có (API thật: 404 NOT_FOUND). */
export async function fetchDeal(dealId: number): Promise<DealDetail> {
  await delay(400);
  const found = DEALS.find((d) => d.dealId === dealId);
  if (!found) throw new NotFoundError(`Không có phòng #${dealId}`);
  return found;
}
