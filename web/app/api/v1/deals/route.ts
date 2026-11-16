// GET /api/v1/deals?wallet=0x...: các hợp đồng mà ví này là chủ trọ hoặc người thuê.
// Người thuê chỉ có trên chuỗi, nên đọc mọi deal đã gắn tin đăng rồi lọc.
import { requireWallet } from "@/lib/server/auth";
import { readDeals } from "@/lib/server/chain";
import { ApiErr, json, photoUrl, route } from "@/lib/server/http";
import { listBoundListings } from "@/lib/server/repo";

export const GET = route(async (req: Request) => {
  const caller = await requireWallet(req);
  const wallet = (new URL(req.url).searchParams.get("wallet") ?? caller).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) throw new ApiErr("BAD_REQUEST", "wallet không hợp lệ");

  const rows = await listBoundListings();
  const deals = await readDeals(rows.map((r) => BigInt(r.deal_id!)));
  const items = rows
    .map((r, i) => ({ r, d: deals[i] }))
    .filter(({ d }) => d.landlord === wallet || d.tenant === wallet)
    .map(({ r, d }) => ({
      dealId: Number(r.deal_id),
      listingId: r.id,
      role: d.landlord === wallet ? "landlord" : "tenant",
      state: d.stateName,
      deadline: d.deadline === BigInt(0) ? null : new Date(Number(d.deadline) * 1000).toISOString(),
      title: r.terms.room.title,
      address: r.terms.room.address,
      depositAmount: d.deposit.toString(),
      coverUrl: r.terms.listingPhotos[0] ? photoUrl(req, r.terms.listingPhotos[0].photoId) : null,
    }));
  return json({ items });
});
