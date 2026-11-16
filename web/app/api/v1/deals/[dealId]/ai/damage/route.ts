// POST và GET /api/v1/deals/:dealId/ai/damage: docs/api-contract.md.
// POST trả 202 ngay, AI chạy nền (after); frontend hỏi GET tới khi status là done hoặc failed.
// Gọi lại khi đã có kết quả thì trả kết quả cũ, không chạy AI lần hai. failed thì POST lại để chạy lại.
import { after } from "next/server";
import { damageResponse, runDamageJob } from "@/lib/server/ai-jobs";
import { requireWallet } from "@/lib/server/auth";
import { requireDeal, requireState } from "@/lib/server/chain";
import { dealContext, isParty } from "@/lib/server/deal-context";
import { ApiErr, json, parseDealId, route } from "@/lib/server/http";
import { claimAiReport, getAiReport, getPhotoSetByHash, retryFailedAiReport } from "@/lib/server/repo";

export const maxDuration = 60;

export const POST = route(async (req: Request, ctx: { params: Promise<{ dealId: string }> }) => {
  const dealId = parseDealId((await ctx.params).dealId);
  const wallet = await requireWallet(req);
  const { deal, listing } = await dealContext(dealId);
  if (!isParty(deal, wallet)) throw new ApiErr("FORBIDDEN", "Chỉ 2 bên của hợp đồng được chạy AI");
  requireState(deal, "CHECKED_OUT");

  const [checkin, checkout] = await Promise.all([
    getPhotoSetByHash(dealId, deal.checkInHash),
    getPhotoSetByHash(dealId, deal.checkOutHash),
  ]);
  if (!checkin || !checkout) throw new ApiErr("CHAIN_MISMATCH", "Hash bộ ảnh trên chuỗi không khớp bộ ảnh đã lưu");

  const { row, created } = await claimAiReport(dealId, "damage", deal.checkOutHash);
  if (created || (row.status !== "done" && (await retryFailedAiReport(row.id)))) {
    after(() => runDamageJob(row, deal, dealId, listing, checkin, checkout));
    return json({ status: "processing" }, 202);
  }
  return json(damageResponse(row, deal, dealId), row.status === "done" ? 200 : 202);
});

export const GET = route(async (_req: Request, ctx: { params: Promise<{ dealId: string }> }) => {
  const dealId = parseDealId((await ctx.params).dealId);
  const deal = await requireDeal(dealId);
  const row = await getAiReport(dealId, "damage");
  return json(damageResponse(row, deal, dealId));
});
