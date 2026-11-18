// POST /api/v1/listings và GET /api/v1/listings?state=OPEN: docs/api-contract.md.
// POST dựng file điều khoản kct.terms/1 (docs/data-contract.md), trả termsHash và tham số createDeal.
import { hashJson } from "@/lib/hash";
import { requireWallet } from "@/lib/server/auth";
import { publicClient, readDeals, readTimeouts } from "@/lib/server/chain";
import { json, photoUrl, readJson, route } from "@/lib/server/http";
import { insertListing, listBoundListings } from "@/lib/server/repo";
import { linkOrphanListingsSoon } from "@/lib/server/link-listings";
import { bad, buildRoomTemplate, createDealArgsOf, iso, termsWithDates, type RoomBody } from "@/lib/server/terms-builder";
import { DEAL_STATES, type DealState } from "@/lib/types";

type Body = RoomBody & { dates?: { moveInDate?: string; leaseEnd?: string } };

export const POST = route(async (req: Request) => {
  const landlord = await requireWallet(req);
  const b = await readJson<Body>(req);
  const moveIn = iso(b.dates?.moveInDate, "moveInDate");
  const leaseEnd = iso(b.dates?.leaseEnd, "leaseEnd");
  const terms = termsWithDates(await buildRoomTemplate(landlord, b), moveIn, leaseEnd);
  const termsHash = hashJson(terms);
  const listingId = await insertListing(landlord, terms, termsHash);
  return json({ listingId, termsHash, terms, createDealArgs: createDealArgsOf(terms, termsHash) }, 201);
});

export const GET = route(async (req: Request) => {
  const stateParam = (new URL(req.url).searchParams.get("state") ?? "OPEN").toUpperCase();
  if (!(DEAL_STATES as readonly string[]).includes(stateParam)) throw bad(`state phải là một trong ${DEAL_STATES.join(", ")}`);

  await linkOrphanListingsSoon(); // gắn nốt tin đăng mồ côi (nếu có) trước khi liệt kê
  const rows = await listBoundListings();
  const deals = await readDeals(rows.map((r) => BigInt(r.deal_id!)));
  // Phòng OPEN đã quá moveInDate + moveInGrace thì contract không nhận cọc nữa (chỉ chờ poke đóng lại):
  // không liệt kê như phòng còn trống, kẻo người thuê bấm cọc rồi gặp lỗi.
  const moveInGrace = stateParam === "OPEN" ? (await readTimeouts()).moveInGrace : 0;
  const nowSec = stateParam === "OPEN" ? Number((await publicClient.getBlock()).timestamp) : 0; // giờ trên chuỗi, như contract
  const items = rows
    .map((r, i) => ({ r, d: deals[i] }))
    .filter(({ d }) => d.stateName === (stateParam as DealState))
    .filter(({ d }) => stateParam !== "OPEN" || nowSec <= Number(d.moveInDate) + moveInGrace)
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
