// POST /api/v1/faucet: docs/api-contract.md > POST /faucet.
// Ví keeper phát 1.000 mUSDC và một ít AVAX thử (nếu ví người dùng gần hết gas). Mỗi ví 1 lần/24 giờ.
import { parseEther, parseUnits } from "viem";
import { addresses, usdcAbi } from "@/lib/chain";
import { requireWallet } from "@/lib/server/auth";
import { publicClient } from "@/lib/server/chain";
import { env } from "@/lib/server/env";
import { ApiErr, json, route } from "@/lib/server/http";
import { claimFaucet, releaseFaucet } from "@/lib/server/repo";
import { keeperSend, keeperWallet } from "@/lib/server/wallets";

const TOKEN_AMOUNT = parseUnits("1000", 6);

export const POST = route(async (req: Request) => {
  const wallet = await requireWallet(req);
  if (!(await claimFaucet(wallet))) throw new ApiErr("RATE_LIMITED", "Ví này đã nhận tiền test trong 24 giờ qua");

  let tokenTxHash: `0x${string}` | null = null;
  try {
    const keeper = keeperWallet();
    tokenTxHash = await keeperSend((w) =>
      w.writeContract({ address: addresses.token, abi: usdcAbi, functionName: "mint", args: [wallet, TOKEN_AMOUNT] }),
    );

    // AVAX chỉ gửi khi ví người dùng có ít hơn mức faucet, và ví keeper còn đủ gas cho chính nó.
    let avaxTxHash: `0x${string}` | null = null;
    const avax = parseEther(env.faucetAvax);
    const [userBal, keeperBal] = await Promise.all([
      publicClient.getBalance({ address: wallet }),
      publicClient.getBalance({ address: keeper.account.address }),
    ]);
    if (userBal < avax && keeperBal > avax * BigInt(3)) {
      // mUSDC đã gửi rồi: gửi AVAX lỗi thì vẫn trả kết quả, không báo lỗi cả lượt.
      avaxTxHash = await keeperSend((w) => w.sendTransaction({ to: wallet, value: avax })).catch((e) => {
        console.error("[faucet] gửi AVAX lỗi:", (e as Error).message?.split("\n")[0]);
        return null;
      });
    }

    return json({
      avaxTxHash,
      tokenTxHash,
      avax: avaxTxHash ? env.faucetAvax : "0",
      token: TOKEN_AMOUNT.toString(),
    });
  } catch (e) {
    // Chỉ cho nhận lại khi chưa gửi được gì; đã gửi mUSDC thì giữ lượt để không phát hai lần.
    if (!tokenTxHash) await releaseFaucet(wallet);
    throw e;
  }
});
