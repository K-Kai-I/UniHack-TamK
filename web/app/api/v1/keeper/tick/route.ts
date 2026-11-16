// POST /api/v1/keeper/tick: cron gọi mỗi phút với header x-keeper-secret.
// Duyệt các deal chưa kết thúc, deal nào canPoke thì ví keeper gửi poke. Ví keeper không nhận được tiền.
// Bot dừng thì tiền không kẹt: ai cũng gọi được poke (nút "Xử lý quá hạn" trên app).
import { timingSafeEqual } from "node:crypto";
import { addresses, escrowAbi } from "@/lib/chain";
import { env } from "@/lib/server/env";
import { FINAL_STATES, readCanPokeMany, readDealCount, readDeals } from "@/lib/server/chain";
import { ApiErr, json, route } from "@/lib/server/http";
import { keeperWallet } from "@/lib/server/wallets";

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

  const keeper = keeperWallet();
  const poked: { dealId: number; txHash: string }[] = [];
  const errors: { dealId: number; error: string }[] = [];
  for (const id of due) {
    try {
      const txHash = await keeper.writeContract({ address: addresses.escrow, abi: escrowAbi, functionName: "poke", args: [id] });
      poked.push({ dealId: Number(id), txHash });
    } catch (e) {
      errors.push({ dealId: Number(id), error: ((e as Error).message ?? "lỗi").split("\n")[0] });
    }
  }
  return json({ checked: live.length, poked, errors });
}

export const POST = route(tick);
// Một số dịch vụ cron chỉ gửi được GET.
export const GET = route(tick);
