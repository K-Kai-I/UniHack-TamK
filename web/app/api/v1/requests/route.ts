// GET /api/v1/requests: yêu cầu thuê của ví đang đăng nhập.
// incoming = yêu cầu gửi tới phòng của tôi (chủ trọ); outgoing = yêu cầu tôi đã gửi (người thuê).
import { requireWallet } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";
import { listRequestsByLandlord, listRequestsByTenant } from "@/lib/server/repo";
import { requestView } from "@/lib/server/rooms-view";

export const GET = route(async (req: Request) => {
  const wallet = await requireWallet(req);
  const [incoming, outgoing] = await Promise.all([listRequestsByLandlord(wallet), listRequestsByTenant(wallet)]);
  return json({ incoming: incoming.map(requestView), outgoing: outgoing.map(requestView) });
});
