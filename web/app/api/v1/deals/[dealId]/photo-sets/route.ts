// POST /api/v1/deals/:dealId/photo-sets: gom ảnh của một lần chụp thành manifest kct.photoset/1, trả setHash.
// Frontend mang setHash lên contract (submitCheckIn / submitCheckOut / reportMismatch).
import { hashJson } from "@/lib/hash";
import { requireWallet } from "@/lib/server/auth";
import { readTimeouts } from "@/lib/server/chain";
import { dealContext } from "@/lib/server/deal-context";
import { ApiErr, json, parseDealId, readJson, route } from "@/lib/server/http";
import { getPhotoMetas, insertPhotoSet } from "@/lib/server/repo";
import type { PhotoSetKind, PhotoSetManifest } from "@/lib/types";

const KINDS: PhotoSetKind[] = ["checkin", "checkout", "mismatch"];
const ZERO_HASH = `0x${"0".repeat(64)}`;

export const POST = route(async (req: Request, ctx: { params: Promise<{ dealId: string }> }) => {
  const dealId = parseDealId((await ctx.params).dealId);
  const wallet = await requireWallet(req);
  const body = await readJson<{ kind?: PhotoSetKind; items?: { positionId?: string; photoId?: string }[] }>(req);
  const kind = body.kind as PhotoSetKind;
  if (!KINDS.includes(kind)) throw new ApiErr("BAD_REQUEST", `kind phải là ${KINDS.join(" | ")}`);

  const { deal, listing } = await dealContext(dealId);
  const now = Math.floor(Date.now() / 1000);

  // ---- ai được chụp, lúc nào (khớp điều kiện của contract để người dùng không ký giao dịch chắc chắn revert)
  if (kind === "checkin" || kind === "mismatch") {
    if (wallet !== deal.tenant) throw new ApiErr("FORBIDDEN", "Chỉ người thuê gửi ảnh này");
    if (deal.stateName !== "RESERVED" || deal.checkInHash !== ZERO_HASH) {
      throw new ApiErr("WRONG_STATE", "Chỉ gửi được khi đã cọc và chưa có ảnh nhận phòng");
    }
  } else {
    const activeOrDue =
      deal.stateName === "ACTIVE" ||
      (deal.stateName === "RESERVED" && deal.checkInHash !== ZERO_HASH && now > Number(deal.deadline));
    if (!activeOrDue) throw new ApiErr("WRONG_STATE", "Chỉ trả phòng được khi hợp đồng đang ở (ACTIVE)");
    if (wallet !== deal.tenant) {
      if (wallet !== deal.landlord) throw new ApiErr("FORBIDDEN", "Chỉ người thuê hoặc chủ trọ gửi ảnh trả phòng");
      const { checkOutGrace } = await readTimeouts();
      if (now <= Number(deal.leaseEnd) + checkOutGrace) {
        throw new ApiErr("FORBIDDEN", "Chủ trọ chỉ trả phòng thay khi đã quá hạn hợp đồng");
      }
    }
  }

  // ---- mỗi vị trí trong điều khoản đúng 1 ảnh
  const positions = listing.terms.positions;
  const given = new Map<string, string>();
  for (const it of body.items ?? []) {
    if (!it.positionId || !it.photoId) throw new ApiErr("BAD_REQUEST", "Mỗi item cần positionId và photoId");
    if (!positions.some((p) => p.id === it.positionId)) throw new ApiErr("BAD_REQUEST", `Không có vị trí ${it.positionId}`);
    if (given.has(it.positionId)) throw new ApiErr("BAD_REQUEST", `Vị trí ${it.positionId} bị gửi 2 lần`);
    given.set(it.positionId, it.photoId);
  }
  const missing = positions.filter((p) => !given.has(p.id)).map((p) => p.id);
  if (missing.length) throw new ApiErr("MISSING_POSITIONS", `Thiếu ảnh ở ${missing.join(", ")}`, { missing });

  const metas = await getPhotoMetas([...given.values()]);
  const createdAt = new Date().toISOString();
  const items = positions.map((p) => {
    const photoId = given.get(p.id)!;
    const m = metas.get(photoId);
    if (!m) throw new ApiErr("NOT_FOUND", `Không có ảnh ${photoId}`);
    if (m.owner !== wallet) throw new ApiErr("FORBIDDEN", `Ảnh ${photoId} không do bạn chụp`);
    if (m.purpose !== kind) throw new ApiErr("BAD_REQUEST", `Ảnh ${photoId} có purpose=${m.purpose}, cần ${kind}`);
    return {
      positionId: p.id,
      sha256: m.sha256,
      capturedAt: m.captured_at ?? createdAt,
      lat: m.lat,
      lng: m.lng,
      accuracyM: m.accuracy_m,
    };
  });

  const manifest: PhotoSetManifest = {
    schema: "kct.photoset/1",
    dealId: Number(dealId),
    kind,
    takenBy: wallet,
    createdAt,
    items,
  };
  const setHash = hashJson(manifest);
  const photoSetId = await insertPhotoSet(dealId, kind, manifest, setHash, Object.fromEntries(given), wallet);
  return json({ photoSetId, setHash, manifest }, 201);
});
