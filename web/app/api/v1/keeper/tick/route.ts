// POST /api/v1/keeper/tick: cron gọi mỗi phút với header x-keeper-secret.
// Duyệt các deal chưa kết thúc, deal nào canPoke thì ví keeper gửi poke. Ví keeper không nhận được tiền.
// Bot dừng thì tiền không kẹt: trang hợp đồng tự nhờ server poke (POST /deals/:id/poke), và poke vốn ai cũng gọi được.
import { timingSafeEqual } from "node:crypto";
import { addresses, escrowAbi } from "@/lib/chain";
import { env } from "@/lib/server/env";
import { FINAL_STATES, readCanPokeMany, readDealCount, readDeals } from "@/lib/server/chain";
import { ApiErr, json, route } from "@/lib/server/http";
import { keeperSend } from "@/lib/server/wallets";
import { syncEvents } from "@/lib/server/events";
import { linkOrphanListings } from "@/lib/server/link-listings";

export const maxDuration = 60;

function secretOk(given: string | null): boolean {
  const want = Buffer.from(env.keeperSecret());
  const got = Buffer.from(given ?? "");
  return got.length === want.length && timingSafeEqual(got, want);
}

async function tick(req: Request) {
  if (!secretOk(req.headers.get("x-keeper-secret"))) throw new ApiErr("UNAUTHORIZED", "Sai x-keeper-secret");

  const count = Number(await readDealCount());
  const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));
  const deals = await readDeals(ids);
  const live = deals.filter((d) => !FINAL_STATES.includes(d.stateName)).map((d) => d.id);
  const can = await readCanPokeMany(live);
  const due = live.filter((_, i) => can[i]);

  const poked: { dealId: number; txHash: string }[] = [];
  const errors: { dealId: number; error: string }[] = [];
  for (const id of due) {
    try {
      const txHash = await keeperSend((w) =>
        w.writeContract({ address: addresses.escrow, abi: escrowAbi, functionName: "poke", args: [id] }),
      );
      poked.push({ dealId: Number(id), txHash });
    } catch (e) {
      errors.push({ dealId: Number(id), error: ((e as Error).message ?? "lỗi").split("\n")[0] });
    }
  }
  // Tiện thể đọc sự kiện mới cho mục history: đọc tối đa 20 giây mỗi lần (RPC Fuji chỉ cho 100 khối mỗi lần gọi).
  // Chặn cứng 30 giây (newEvents = -2): lượt đọc dở vẫn an toàn vì con trỏ đã lưu sau mỗi đoạn, lần sau đọc tiếp.
  const events = await Promise.race([
    syncEvents(1000, 20_000),
    new Promise<number>((resolve) => setTimeout(() => resolve(-2), 30_000)),
  ]).catch((e) => {
    console.error("[events]", (e as Error).message?.split("\n")[0]);
    return -1;
  });
  // Tin đăng đã lên chuỗi nhưng app chưa kịp báo máy chủ (mất bước POST /listings/:id/onchain): tự gắn.
  const linkedListings = await linkOrphanListings().catch((e) => {
    console.error("[link]", e);
    return -1;
  });
  return json({ checked: live.length, poked, errors, newEvents: events, linkedListings });
}

export const POST = route(tick);
// Một số dịch vụ cron chỉ gửi được GET.
export const GET = route(tick);
