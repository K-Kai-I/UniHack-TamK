// Ví của server: ví keeper (gọi poke, gửi faucet) và ví ký con dấu AI.
// Không ví nào nhận được tiền cọc: contract chỉ chuyển tiền cho 2 bên của hợp đồng.
import "server-only";
import { createWalletClient, http } from "viem";
import { nonceManager, privateKeyToAccount } from "viem/accounts";
import { chain } from "../chain";
import { env } from "./env";

let keeper: ReturnType<typeof makeKeeper> | undefined;
function makeKeeper() {
  // nonceManager: tự tăng nonce khi gửi nhiều giao dịch liên tiếp.
  const account = privateKeyToAccount(env.keeperKey(), { nonceManager });
  return createWalletClient({ account, chain, transport: http(env.fujiRpcUrl) });
}
export function keeperWallet() {
  keeper ??= makeKeeper();
  return keeper;
}

/** Gửi giao dịch bằng ví keeper, thử lại tối đa 2 lần khi lệch nonce.
 *  Faucet và bot keeper dùng chung một ví và có thể chạy ở hai phiên bản hàm khác nhau cùng lúc,
 *  nên nonce nhớ trong tiến trình có thể cũ. Lệch thì bỏ nonce đã nhớ để lấy lại từ chuỗi. */
export async function keeperSend<T>(send: (w: ReturnType<typeof makeKeeper>) => Promise<T>): Promise<T> {
  const w = keeperWallet();
  for (let attempt = 0; ; attempt++) {
    try {
      return await send(w);
    } catch (e) {
      const msg = ((e as Error).message ?? "").toLowerCase();
      const nonceIssue = msg.includes("nonce") || msg.includes("replacement transaction underpriced") || msg.includes("already known");
      if (!nonceIssue || attempt >= 2) throw e;
      nonceManager.reset({ address: w.account.address, chainId: chain.id });
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}

export function aiSignerAccount() {
  return privateKeyToAccount(env.aiSignerKey());
}
