// GET /api/v1/photos/:photoId: trả byte ảnh. Bucket "photos" là private nên ảnh luôn đi qua server.
// Id ảnh có 64 bit ngẫu nhiên, không đoán được. Che mặt và đồ cá nhân là việc sau MVP.
import { ApiErr, route } from "@/lib/server/http";
import { getPhotoBytes } from "@/lib/server/storage";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ photoId: string }> }) => {
  const { photoId } = await ctx.params;
  if (!/^ph_[a-z0-9]+$/.test(photoId)) throw new ApiErr("BAD_REQUEST", "photoId không hợp lệ");
  const p = await getPhotoBytes(photoId);
  if (!p) throw new ApiErr("NOT_FOUND", "Không có ảnh này");
  return new Response(Buffer.from(p.data), {
    headers: { "content-type": p.mime, "cache-control": "private, max-age=31536000, immutable" },
  });
});
