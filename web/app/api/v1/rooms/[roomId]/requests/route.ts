// POST /api/v1/rooms/:roomId/requests: người thuê gửi yêu cầu thuê kèm ngày dọn vào và ngày hết hạn.
import { requireWallet } from "@/lib/server/auth";
import { ApiErr, json, readJson, route } from "@/lib/server/http";
import { assertDatesFree } from "@/lib/server/booking";
import { getRoom, hasPendingRequest, insertRequest } from "@/lib/server/repo";
import { bad, checkDates, iso } from "@/lib/server/terms-builder";

/** Ngày dọn vào phải sau lúc gửi ít nhất chừng này, để chủ trọ kịp duyệt và người thuê kịp cọc. */
const MIN_LEAD_MS = 60 * 60 * 1000;

export const POST = route(async (req: Request, ctx: { params: Promise<{ roomId: string }> }) => {
  const tenant = await requireWallet(req);
  const { roomId } = await ctx.params;
  const room = await getRoom(roomId);
  if (!room || !room.active) throw new ApiErr("NOT_FOUND", "Không có phòng này");
  if (room.landlord === tenant) throw new ApiErr("FORBIDDEN", "Không gửi yêu cầu thuê phòng của chính mình");

  const b = await readJson<{ moveInDate?: string; leaseEnd?: string; note?: string }>(req);
  const moveIn = iso(b.moveInDate, "moveInDate");
  const leaseEnd = iso(b.leaseEnd, "leaseEnd");
  checkDates(moveIn, leaseEnd);
  if (moveIn.getTime() < Date.now() + MIN_LEAD_MS) throw bad("Ngày dọn vào phải sau lúc này ít nhất 1 giờ");
  if (leaseEnd.getTime() - moveIn.getTime() > 5 * 366 * 86400_000) throw bad("Thời hạn thuê tối đa 5 năm");
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 500) : null;
  if (await hasPendingRequest(roomId, tenant)) throw new ApiErr("WRONG_STATE", "Bạn đã có một yêu cầu đang chờ duyệt cho phòng này");
  // Trùng khoảng ngày đã có người thuê (yêu cầu đã duyệt, hợp đồng còn giữ phòng) thì không nhận.
  await assertDatesFree(roomId, moveIn, leaseEnd);

  const requestId = await insertRequest({ roomId, tenant, moveIn, leaseEnd, note });
  return json({ requestId, status: "PENDING" }, 201);
});
