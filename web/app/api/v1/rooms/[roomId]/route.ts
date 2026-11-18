// GET /api/v1/rooms/:roomId: chi tiết một phòng trong danh mục (công khai).
import { ApiErr, json, route } from "@/lib/server/http";
import { getRoom } from "@/lib/server/repo";
import { roomDetail } from "@/lib/server/rooms-view";

export const GET = route(async (req: Request, ctx: { params: Promise<{ roomId: string }> }) => {
  const { roomId } = await ctx.params;
  const room = await getRoom(roomId);
  if (!room || !room.active) throw new ApiErr("NOT_FOUND", "Không có phòng này");
  return json(roomDetail(req, room));
});
