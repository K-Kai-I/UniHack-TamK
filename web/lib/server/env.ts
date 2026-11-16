// Biến môi trường phía server. Không import file này từ component client.
import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name} (xem web/.env.example)`);
  return v;
}

export const env = {
  fujiRpcUrl: process.env.FUJI_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc",
  vndPerToken: Number(process.env.VND_PER_TOKEN ?? 25000),
  feeBps: Number(process.env.FEE_BPS ?? 1000),
  /** AVAX gửi cho ví mới ở /faucet (đủ trả gas vài chục giao dịch trên Fuji). */
  faucetAvax: process.env.FAUCET_AVAX ?? "0.005",
  // Đọc khi cần, để route không dùng tới thì không bắt buộc phải có.
  aiSignerKey: () => required("AI_SIGNER_PRIVATE_KEY") as `0x${string}`,
  keeperKey: () => required("KEEPER_PRIVATE_KEY") as `0x${string}`,
  keeperSecret: () => required("KEEPER_SECRET"),
  privyAppId: () => required("NEXT_PUBLIC_PRIVY_APP_ID"),
  privyAppSecret: () => required("PRIVY_APP_SECRET"),
  supabaseUrl: process.env.SUPABASE_URL,
  storageKey: process.env.STORAGE_KEY,
};
