// POST /api/v1/listings/:listingId/onchain: gắn dealId sau khi createDeal thành công.
// Chỉ nhận khi termsHash và landlord trên chuỗi khớp với tin đăng đã lưu.
import { publicClient, readDeal } from "@/lib/server/chain";
import { requireWallet } from "@/lib/server/auth";
import { ApiErr, json, readJson, route } from "@/lib/server/http";
import { bindListing, getListing, getListingByDeal } from "@/lib/server/repo";

export const POST = route(async (req: Request, ctx: { params: Promise<{ listingId: string }> }) => {
  const { listingId } = await ctx.params;
  const wallet = await requireWallet(req);
  const body = await readJson<{ dealId?: number; txHash?: string }>(req);
  const dealId = Number(body.dealId);
  if (!Number.isSafeInteger(dealId) || dealId <= 0) throw new ApiErr("BAD_REQUEST", "dealId không hợp lệ");
  const txHash = typeof body.txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(body.txHash) ? body.txHash : null;
  if (!txHash) throw new ApiErr("BAD_REQUEST", "txHash không hợp lệ");

  const listing = await getListing(listingId);
  if (!listing) throw new ApiErr("NOT_FOUND", "Không có tin đăng này");
  if (listing.landlord !== wallet) throw new ApiErr("FORBIDDEN", "Chỉ chủ trọ đăng tin mới gắn được");
  if (listing.deal_id) {
    if (listing.deal_id === String(dealId)) return json({ ok: true });
    throw new ApiErr("CHAIN_MISMATCH", `Tin đăng đã gắn với hợp đồng #${listing.deal_id}`);
  }
  const taken = await getListingByDeal(BigInt(dealId));
  if (taken) throw new ApiErr("CHAIN_MISMATCH", `Hợp đồng #${dealId} đã gắn với tin đăng khác`);

  // Frontend gọi ngay sau khi giao dịch xác nhận; RPC có thể trễ một nhịp nên chờ biên nhận trước khi đọc.
  await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}`, timeout: 20_000 }).catch(() => null);
  const d = await readDeal(BigInt(dealId));
  if (d.termsHash.toLowerCase() !== listing.terms_hash.toLowerCase() || d.landlord !== listing.landlord) {
    throw new ApiErr("CHAIN_MISMATCH", "termsHash hoặc chủ trọ trên chuỗi không khớp tin đăng");
  }
  await bindListing(listingId, BigInt(dealId), txHash);
  return json({ ok: true });
});
