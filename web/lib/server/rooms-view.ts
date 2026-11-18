// Dạng trả về của danh mục phòng (GET /rooms, GET /rooms/:id) và yêu cầu thuê (GET /requests).
import "server-only";
import type { RequestRow, RoomRow } from "./repo";
import { photoUrl } from "./http";

/** Bỏ dấu tiếng Việt, chữ thường: "Quận 10" và "quan 10" coi là một. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
}

export function roomSummary(req: Request, r: RoomRow) {
  const t = r.template;
  return {
    roomId: r.id,
    title: t.room.title,
    address: t.room.address,
    rentVnd: t.room.rentVnd,
    amenities: t.room.amenities,
    depositAmount: t.money.depositAmount,
    reserveFeeAmount: t.money.reserveFeeAmount,
    coverUrl: t.listingPhotos[0] ? photoUrl(req, t.listingPhotos[0].photoId) : null,
    landlord: r.landlord,
    createdAt: r.created_at,
  };
}

export function roomDetail(req: Request, r: RoomRow) {
  const t = r.template;
  return {
    ...roomSummary(req, r),
    listingPhotoUrls: t.listingPhotos.map((p) => photoUrl(req, p.photoId)),
    positions: t.positions.map((p) => ({ id: p.id, name: p.name, instruction: p.instruction, exampleUrl: photoUrl(req, p.examplePhoto.photoId) })),
    priceList: t.priceList,
    yieldEnabled: t.yieldEnabled,
  };
}

export function requestView(q: RequestRow) {
  return {
    requestId: q.id,
    roomId: q.room_id,
    title: q.title ?? "",
    landlord: q.landlord,
    tenant: q.tenant,
    moveInDate: q.move_in,
    leaseEnd: q.lease_end,
    note: q.note,
    status: q.status,
    listingId: q.listing_id,
    dealId: q.deal_id ? Number(q.deal_id) : null,
    createdAt: q.created_at,
    decidedAt: q.decided_at,
  };
}
