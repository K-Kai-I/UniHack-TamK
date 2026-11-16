// GET /api/v1/deals/:dealId: điều khoản + trạng thái trên chuỗi + bộ ảnh + báo cáo AI.
// Phần onchain đọc từ contract ở mỗi lần gọi. history lấy từ sự kiện contract đã đọc về database.
import { readCanPoke } from "@/lib/server/chain";
import { onchainView } from "@/lib/server/chain";
import { dealContext } from "@/lib/server/deal-context";
import { dealHistory, syncEventsSoon } from "@/lib/server/events";
import { json, parseDealId, photoUrl, route } from "@/lib/server/http";
import { getAiReport, getLatestPhotoSet, getPhotoSetByHash, type PhotoSetRow } from "@/lib/server/repo";
import type { DamageReport, MismatchReport } from "@/lib/types";

const ZERO_HASH = `0x${"0".repeat(64)}`;

export const GET = route(async (req: Request, ctx: { params: Promise<{ dealId: string }> }) => {
  const dealId = parseDealId((await ctx.params).dealId);
  const { deal, listing } = await dealContext(dealId);
  // Đọc thêm sự kiện mới cho history, có giới hạn tần suất và thời gian chờ để trang không bị chậm.
  await syncEventsSoon();

  const [canPoke, checkin, checkout, mismatch, damageRow, mismatchRow, history] = await Promise.all([
    readCanPoke(dealId),
    deal.checkInHash !== ZERO_HASH ? getPhotoSetByHash(dealId, deal.checkInHash) : null,
    deal.checkOutHash !== ZERO_HASH ? getPhotoSetByHash(dealId, deal.checkOutHash) : null,
    getLatestPhotoSet(dealId, "mismatch"),
    getAiReport(dealId, "damage"),
    getAiReport(dealId, "mismatch"),
    dealHistory(dealId).catch(() => []),
  ]);

  const setView = (s: PhotoSetRow | null) =>
    s && {
      photoSetId: s.id,
      setHash: s.set_hash,
      items: listing.terms.positions
        .filter((p) => s.photo_ids[p.id])
        .map((p) => ({ positionId: p.id, url: photoUrl(req, s.photo_ids[p.id]) })),
    };
  const terms = listing.terms;

  return json({
    dealId: Number(dealId),
    listingId: listing.id,
    onchain: onchainView(deal, canPoke),
    terms,
    // Terms chỉ có photoId + sha256; frontend cần URL để hiện ảnh đăng tin và ảnh ví dụ.
    listingPhotoUrls: terms.listingPhotos.map((p) => photoUrl(req, p.photoId)),
    examplePhotoUrls: Object.fromEntries(terms.positions.map((p) => [p.id, photoUrl(req, p.examplePhoto.photoId)])),
    photoSets: { checkin: setView(checkin), checkout: setView(checkout), mismatch: setView(mismatch) },
    reports: {
      damage: damageRow?.status === "done" ? (damageRow.report as DamageReport) : null,
      mismatch: mismatchRow?.status === "done" ? (mismatchRow.report as MismatchReport) : null,
    },
    aiStatus: { damage: damageRow?.status ?? null, mismatch: mismatchRow?.status ?? null },
    // Lời giải thích của OpenAI (nếu có): chỉ để tham khảo, không nằm trong báo cáo đã ký.
    explanation: damageRow?.status === "done" ? (damageRow.explanation ?? null) : null,
    history,
  });
});
