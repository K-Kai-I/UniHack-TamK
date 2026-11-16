// GET /api/v1/disputes/:dealId: bằng chứng của một vụ cho bồi thẩm.
// DEDUCTION: chỉ các vị trí AI kết luận khác "không đổi" (ảnh nhận và trả phòng cạnh nhau).
// MISMATCH: ảnh ví dụ lúc đăng tin cạnh ảnh người thuê chụp thực tế.
import { requireState } from "@/lib/server/chain";
import { dealContext } from "@/lib/server/deal-context";
import { json, parseDealId, photoUrl, route } from "@/lib/server/http";
import { getAiReport, getLatestPhotoSet, getPhotoSetByHash } from "@/lib/server/repo";
import { DISPUTE_KINDS, type DamageReport, type MismatchReport } from "@/lib/types";

export const GET = route(async (req: Request, ctx: { params: Promise<{ dealId: string }> }) => {
  const dealId = parseDealId((await ctx.params).dealId);
  const { deal, listing } = await dealContext(dealId);
  requireState(deal, "DISPUTED", "SETTLED", "REFUNDED");
  const terms = listing.terms;
  const kind = DISPUTE_KINDS[deal.disputeKind];
  const base = {
    dealId: Number(dealId),
    kind,
    state: deal.stateName,
    deadline: deal.deadline === BigInt(0) ? null : new Date(Number(deal.deadline) * 1000).toISOString(),
    votes: { landlord: deal.votesLandlord, tenant: deal.votesTenant },
    hasAiSeal: deal.hasAiSeal,
    priceList: terms.priceList,
  };

  if (kind === "MISMATCH") {
    const [set, row] = await Promise.all([getLatestPhotoSet(dealId, "mismatch"), getAiReport(dealId, "mismatch")]);
    const report = row?.status === "done" ? (row.report as MismatchReport) : null;
    return json({
      ...base,
      aiVerdict: report?.verdict ?? null,
      aiReasons: report?.reasons ?? [],
      evidence: terms.positions.map((p) => ({
        positionId: p.id,
        name: p.name,
        beforeUrl: photoUrl(req, p.examplePhoto.photoId),
        afterUrl: set?.photo_ids[p.id] ? photoUrl(req, set.photo_ids[p.id]) : null,
      })),
    });
  }

  const [checkin, checkout, row] = await Promise.all([
    getPhotoSetByHash(dealId, deal.checkInHash),
    getPhotoSetByHash(dealId, deal.checkOutHash),
    getAiReport(dealId, "damage"),
  ]);
  const report = row?.status === "done" ? (row.report as DamageReport) : null;
  const byPos = new Map(report?.positions.map((p) => [p.positionId, p]) ?? []);
  const evidence = terms.positions
    .filter((p) => !report || byPos.get(p.id)?.verdict !== "NO_CHANGE")
    .map((p) => ({
      positionId: p.id,
      name: p.name,
      beforeUrl: checkin?.photo_ids[p.id] ? photoUrl(req, checkin.photo_ids[p.id]) : null,
      afterUrl: checkout?.photo_ids[p.id] ? photoUrl(req, checkout.photo_ids[p.id]) : null,
      aiVerdict: byPos.get(p.id)?.verdict ?? null,
      aiDescription: byPos.get(p.id)?.description ?? null,
      aiAmount: byPos.get(p.id)?.amount ?? null,
    }));
  return json({
    ...base,
    landlordAmount: deal.proposedAmount.toString(),
    tenantAmount: deal.counterAmount.toString(),
    aiAmount: deal.aiAmount.toString(),
    evidence,
  });
});
