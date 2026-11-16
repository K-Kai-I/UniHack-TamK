// POST và GET /api/v1/deals/:dealId/ai/mismatch: so ảnh đăng tin với ảnh thực tế, ký con dấu MismatchReport.
// Luồng: POST /uploads (purpose=mismatch) từng vị trí → POST /photo-sets (kind=mismatch) → POST ở đây
// → GET tới khi done → người thuê ký reportMismatch(id, seal.verdict, seal.evidenceHash, seal.reportHash, seal.signature).
import { after } from "next/server";
import { mismatchResponse, runMismatchJob } from "@/lib/server/ai-jobs";
import { requireWallet } from "@/lib/server/auth";
import { requireDeal } from "@/lib/server/chain";
import { dealContext } from "@/lib/server/deal-context";
import { ApiErr, json, parseDealId, readJson, route } from "@/lib/server/http";
import { claimAiReport, getAiReport, getPhotoSet, retryFailedAiReport } from "@/lib/server/repo";

export const maxDuration = 60;
const ZERO_HASH = `0x${"0".repeat(64)}`;

export const POST = route(async (req: Request, ctx: { params: Promise<{ dealId: string }> }) => {
  const dealId = parseDealId((await ctx.params).dealId);
  const wallet = await requireWallet(req);
  const { photoSetId } = await readJson<{ photoSetId?: string }>(req);
  const { deal, listing } = await dealContext(dealId);
  if (wallet !== deal.tenant) throw new ApiErr("FORBIDDEN", "Chỉ người thuê báo phòng sai mô tả");
  if (deal.stateName !== "RESERVED" || deal.checkInHash !== ZERO_HASH) {
    throw new ApiErr("WRONG_STATE", "Chỉ báo được khi đã cọc và chưa gửi ảnh nhận phòng");
  }
  const set = photoSetId ? await getPhotoSet(photoSetId) : null;
  if (!set || set.deal_id !== dealId.toString() || set.kind !== "mismatch") {
    throw new ApiErr("NOT_FOUND", "Không có bộ ảnh báo phòng sai này cho hợp đồng");
  }

  const { row, created } = await claimAiReport(dealId, "mismatch", set.set_hash);
  if (created || (row.status !== "done" && (await retryFailedAiReport(row.id)))) {
    after(() => runMismatchJob(row, deal, dealId, listing, set));
    return json({ status: "processing" }, 202);
  }
  return json(mismatchResponse(row, dealId), row.status === "done" ? 200 : 202);
});

export const GET = route(async (_req: Request, ctx: { params: Promise<{ dealId: string }> }) => {
  const dealId = parseDealId((await ctx.params).dealId);
  await requireDeal(dealId);
  return json(mismatchResponse(await getAiReport(dealId, "mismatch"), dealId));
});
