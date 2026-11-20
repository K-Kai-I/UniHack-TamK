import "server-only";
// Server tự gọi poke khi hết hạn, thay cho nút "Xử lý quá hạn" trên app. Poke vốn ai cũng gọi được và kết quả
// do contract quyết theo luật đã chốt; ví keeper chỉ trả gas, không nhận tiền (AGENTS.md luật 3 cho phép keeper poke).
// Chỉ gửi khi contract báo canPoke, nên gọi thừa cũng không làm gì.
import { addresses, escrowAbi } from "@/lib/chain";
import { readCanPoke, requireDeal } from "./chain";
import { keeperSend } from "./wallets";

export async function pokeIfDue(dealId: bigint): Promise<{ poked: boolean; state: string; txHash?: string }> {
  const d = await requireDeal(dealId);
  if (!(await readCanPoke(dealId))) return { poked: false, state: d.stateName };
  try {
    const txHash = await keeperSend((w) =>
      w.writeContract({ address: addresses.escrow, abi: escrowAbi, functionName: "poke", args: [dealId] }),
    );
    return { poked: true, state: d.stateName, txHash };
  } catch (e) {
    // Thường là bot hoặc người khác vừa poke trước: không phải lỗi của người dùng.
    console.warn("[auto-poke]", dealId.toString(), ((e as Error).message ?? "").split("\n")[0]);
    return { poked: false, state: d.stateName };
  }
}
