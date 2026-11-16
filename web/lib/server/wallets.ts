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

export function aiSignerAccount() {
  return privateKeyToAccount(env.aiSignerKey());
}
