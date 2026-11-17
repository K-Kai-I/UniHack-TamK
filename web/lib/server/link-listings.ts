// Tự gắn tin đăng với hợp đồng trên chuỗi khi bước "báo cho máy chủ" (POST /listings/:id/onchain) bị mất,
// vd trình duyệt điện thoại bị đẩy sang app ví rồi tải lại trang, hoặc mạng rớt ngay sau khi ký.
// Chỉ gắn khi termsHash VÀ ví chủ trọ trên chuỗi khớp tin đăng, đúng điều kiện của route /onchain,
// nên không ai "nhận vơ" được phòng của người khác.
import "server-only";
import { readDealCount, readDeals } from "./chain";
import { db } from "./db";

/** Số hợp đồng mới nhất được xem mỗi lần (tin đăng mồ côi gần như luôn ứng với hợp đồng vừa tạo). */
const LOOKBACK = 50;

export type OrphanListing = {
  id: string;
  landlord: string;
  terms_hash: string;
};
export type ChainDeal = { id: bigint; landlord: string; termsHash: string };

/** Ghép tin đăng chưa gắn với hợp đồng chưa có tin đăng. Hàm thuần, không đụng database hay chuỗi.
 *  Một hợp đồng chỉ gắn một tin; nếu nhiều tin trùng điều khoản thì tin cũ nhất (đứng trước) được gắn trước. */
export function matchOrphans(
  orphans: OrphanListing[],
  deals: ChainDeal[],
  boundDealIds: Set<string>,
) {
  const pool = [...orphans];
  const out: { listingId: string; dealId: bigint }[] = [];
  for (const d of [...deals].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (boundDealIds.has(d.id.toString())) continue;
    const i = pool.findIndex(
      (o) =>
        o.landlord.toLowerCase() === d.landlord.toLowerCase() &&
        o.terms_hash.toLowerCase() === d.termsHash.toLowerCase(),
    );
    if (i < 0) continue;
    out.push({ listingId: pool[i].id, dealId: d.id });
    pool.splice(i, 1);
  }
  return out;
}

/** Gắn mọi tin đăng mồ côi khớp được. Trả số tin vừa gắn. Không có tin mồ côi thì không gọi RPC. */
export async function linkOrphanListings(): Promise<number> {
  const conn = await db();
  const orphans = await conn.query<OrphanListing>(
    "SELECT id, landlord, terms_hash FROM listings WHERE deal_id IS NULL ORDER BY created_at",
  );
  if (orphans.length === 0) return 0;

  const count = Number(await readDealCount());
  const from = Math.max(1, count - LOOKBACK + 1);
  const ids = Array.from({ length: count - from + 1 }, (_, i) =>
    BigInt(from + i),
  );
  if (ids.length === 0) return 0;
  const deals = await readDeals(ids);
  const bound = new Set(
    (
      await conn.query<{ deal_id: string }>(
        "SELECT deal_id FROM listings WHERE deal_id IS NOT NULL",
      )
    ).map((r) => String(r.deal_id)),
  );

  let linked = 0;
  for (const m of matchOrphans(orphans, deals, bound)) {
    // Lấy txHash từ sự kiện DealCreated nếu đã đọc về; chưa có thì để trống (cột cho phép null).
    const ev = await conn.query<{ tx_hash: string }>(
      "SELECT tx_hash FROM chain_events WHERE deal_id = $1 AND event = 'DealCreated' LIMIT 1",
      [m.dealId.toString()],
    );
    const res = await conn.query<{ id: string }>(
      `UPDATE listings SET deal_id = $2, tx_hash = $3
       WHERE id = $1 AND deal_id IS NULL AND NOT EXISTS (SELECT 1 FROM listings WHERE deal_id = $2)
       RETURNING id`,
      [m.listingId, m.dealId.toString(), ev[0]?.tx_hash ?? null],
    );
    if (res.length) {
      linked++;
      console.log(
        `[link] tin đăng ${m.listingId} → hợp đồng #${m.dealId} (tự gắn)`,
      );
    }
  }
  return linked;
}

let lastAt = 0;
let running: Promise<unknown> | null = null;

/** Bản nhẹ cho GET /listings: tối đa 1 lần / 15 giây mỗi phiên bản hàm, không bắt người xem chờ quá waitMs. */
export async function linkOrphanListingsSoon(waitMs = 2000): Promise<void> {
  if (!running && Date.now() - lastAt > 15_000) {
    lastAt = Date.now();
    running = linkOrphanListings()
      .catch((e) =>
        console.error("[link]", (e as Error).message?.split("\n")[0]),
      )
      .finally(() => {
        running = null;
      });
  }
  if (running)
    await Promise.race([running, new Promise((r) => setTimeout(r, waitMs))]);
}
