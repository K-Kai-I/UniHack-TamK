// Bot keeper chạy tay: duyệt mọi deal, deal nào canPoke() = true thì gọi poke().
// Dùng khi demo nếu chưa có cron gọi POST /api/v1/keeper/tick.
// Chạy từ thư mục web (để dùng viem đã cài):  cd web && node ../scripts/keeper.mjs
// Cần biến môi trường KEEPER_PRIVATE_KEY (và FUJI_RPC_URL nếu không dùng RPC công khai).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "web", "package.json"));
const { createPublicClient, createWalletClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { avalancheFuji } = require("viem/chains");

const deployments = JSON.parse(readFileSync(join(root, "shared", "deployments.json"), "utf8"));
const abi = JSON.parse(readFileSync(join(root, "shared", "abi", "DepositEscrow.json"), "utf8"));
const escrow = deployments.contracts.DepositEscrow;
const rpc = process.env.FUJI_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc";
const key = process.env.KEEPER_PRIVATE_KEY;
if (!key) throw new Error("Thiếu KEEPER_PRIVATE_KEY");

const publicClient = createPublicClient({ chain: avalancheFuji, transport: http(rpc) });
const wallet = createWalletClient({ chain: avalancheFuji, transport: http(rpc), account: privateKeyToAccount(key) });
const intervalMs = Number(process.env.KEEPER_INTERVAL_MS ?? 60_000);

async function tick() {
  const count = await publicClient.readContract({ address: escrow, abi, functionName: "dealCount" });
  for (let id = 1n; id <= count; id++) {
    const ready = await publicClient.readContract({ address: escrow, abi, functionName: "canPoke", args: [id] });
    if (!ready) continue;
    try {
      const hash = await wallet.writeContract({ address: escrow, abi, functionName: "poke", args: [id] });
      console.log(new Date().toISOString(), `poke deal ${id}: https://testnet.snowtrace.io/tx/${hash}`);
    } catch (e) {
      console.error(`poke deal ${id} lỗi:`, e.shortMessage ?? e.message);
    }
  }
}

console.log(`Keeper chạy mỗi ${intervalMs / 1000}s trên ${escrow}`);
await tick();
setInterval(() => tick().catch((e) => console.error(e.message)), intervalMs);
