// POST /api/v1/deals/:dealId/confirm-checkin: hết hạn chủ trọ phản đối ảnh nhận phòng thì chuyển hợp đồng sang Đang ở ngay.
// Contract không tự đổi trạng thái theo giờ: cần ai đó gọi poke. Bình thường bot keeper làm việc này (cron), nhưng
// cron GitHub hay trễ nên màn hợp đồng gọi endpoint này để người dùng không phải thấy "Đã quá hạn" và bấm tay.
// Chỉ làm đúng một việc an toàn: RESERVED + đã có ảnh nhận phòng + contract báo canPoke → ví keeper gửi poke
// (kết quả theo luật: sang ACTIVE). Ví keeper không nhận tiền; poke vốn ai cũng gọi được (AGENTS.md luật 3 cho phép keeper).
import { zeroHash } from "viem";
import { addresses, escrowAbi } from "@/lib/chain";
import { readCanPoke, requireDeal } from "@/lib/server/chain";
import { ApiErr, json, route } from "@/lib/server/http";
import { keeperSend } from "@/lib/server/wallets";

export const POST = route(async (_req: Request, ctx: { params: Promise<{ dealId: string }> }) => {
  const { dealId } = await ctx.params;
  if (!/^\d+$/.test(dealId)) throw new ApiErr("BAD_REQUEST", "dealId không hợp lệ");
  const id = BigInt(dealId);
  const d = await requireDeal(id);
  if (d.stateName !== "RESERVED" || d.checkInHash === zeroHash) return json({ poked: false, state: d.stateName });
  if (!(await readCanPoke(id))) return json({ poked: false, state: d.stateName });
  try {
    const txHash = await keeperSend((w) =>
      w.writeContract({ address: addresses.escrow, abi: escrowAbi, functionName: "poke", args: [id] }),
    );
    return json({ poked: true, txHash });
  } catch (e) {
    // Thường là bot hoặc người khác vừa poke trước: không phải lỗi của người dùng.
    console.warn("[confirm-checkin]", dealId, ((e as Error).message ?? "").split("\n")[0]);
    return json({ poked: false, state: d.stateName });
  }
});
