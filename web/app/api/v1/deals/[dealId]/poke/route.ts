// POST /api/v1/deals/:dealId/poke: hết hạn thì nhờ ví keeper gọi poke ngay (trang hợp đồng tự gọi khi canPoke),
// để người dùng không phải bấm "Xử lý quá hạn" và không phải chờ cron. Không cần đăng nhập, không có body.
import { pokeIfDue } from "@/lib/server/auto-poke";
import { json, parseDealId, route } from "@/lib/server/http";

export const POST = route(async (_req: Request, ctx: { params: Promise<{ dealId: string }> }) => {
  const dealId = parseDealId((await ctx.params).dealId);
  return json(await pokeIfDue(dealId));
});
