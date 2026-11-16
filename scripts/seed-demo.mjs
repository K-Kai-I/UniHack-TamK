// Tạo phòng mẫu cho demo: tải ảnh, đăng tin, ký createDeal, gắn dealId.
// Chạy trên máy (không chạy trên Vercel), gọi API của chính server local với chế độ AUTH_DEV_BYPASS.
//
//   1. Đặt ảnh vào scripts/demo/photos/ (tên file theo scripts/demo/rooms.json).
//   2. Thêm vào web/.env.local:  DEMO_LANDLORD_PRIVATE_KEY=0x...   (ví chủ trọ mẫu, cần chút AVAX)
//   3. Terminal 1:  cd web && AUTH_DEV_BYPASS=1 npm run dev
//   4. Terminal 2:  cd web && node ../scripts/seed-demo.mjs
//      Tạo lãi giả cho vault (để demo phần chia lãi):  node ../scripts/seed-demo.mjs --yield 5
//      Gửi mồi vào vault (1 lần cho bản deploy v4):     node ../scripts/seed-demo.mjs --seed-vault
//
// Server local dùng cùng DATABASE_URL / Supabase / Fuji với Vercel, nên phòng tạo ra hiện luôn trên app thật.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "web", "package.json"));
const { createPublicClient, createWalletClient, http, parseUnits, decodeEventLog } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { avalancheFuji } = require("viem/chains");

// Đọc web/.env.local (không in giá trị nào ra màn hình).
const env = Object.fromEntries(
  readFileSync(join(root, "web/.env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const API = process.env.API_URL ?? "http://localhost:3000/api/v1";
const RPC = process.env.FUJI_RPC_URL ?? env.FUJI_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc";
const deployments = JSON.parse(readFileSync(join(root, "shared/deployments.json"), "utf8"));
const escrowAbi = JSON.parse(readFileSync(join(root, "shared/abi/DepositEscrow.json"), "utf8"));
const vaultAbi = JSON.parse(readFileSync(join(root, "shared/abi/MockVault.json"), "utf8"));
const chain = { ...avalancheFuji, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });

// ---- gửi mồi vào vault (chạy 1 lần sau khi deploy bản có vault mà script deploy chưa tự gửi mồi)
if (process.argv.includes("--seed-vault")) {
  const vaultAddr = deployments.contracts.MockVault;
  if (!vaultAddr) throw new Error("Bản deploy hiện tại không có vault");
  const key = env.KEEPER_PRIVATE_KEY;
  if (!key) throw new Error("Thiếu KEEPER_PRIVATE_KEY trong web/.env.local");
  const usdcAbi = JSON.parse(readFileSync(join(root, "shared/abi/MockUSDC.json"), "utf8"));
  const usdcAddr = deployments.contracts.MockUSDC;
  const DEAD = "0x000000000000000000000000000000000000dEaD";
  const read = (address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args });
  const [supply, assets, deadShares] = await Promise.all([
    read(vaultAddr, vaultAbi, "totalSupply"),
    read(vaultAddr, vaultAbi, "totalAssets"),
    read(vaultAddr, vaultAbi, "balanceOf", [DEAD]),
  ]);
  if (deadShares > 0n) {
    console.log("Vault đã có mồi rồi, không cần làm gì.");
    process.exit(0);
  }
  if (supply === 0n && assets > 0n) {
    throw new Error("Vault rỗng nhưng đã có tiền bị chuyển vào trước: gửi mồi không còn tác dụng. Cần deploy bản mới.");
  }
  const keeper = createWalletClient({ chain, transport: http(RPC), account: privateKeyToAccount(key) });
  const amount = parseUnits("1000", 6);
  const send = async (address, abi, functionName, args) => {
    const hash = await keeper.writeContract({ address, abi, functionName, args });
    await pub.waitForTransactionReceipt({ hash });
    return hash;
  };
  await send(usdcAddr, usdcAbi, "mint", [keeper.account.address, amount]);
  await send(usdcAddr, usdcAbi, "approve", [vaultAddr, amount]);
  const hash = await send(vaultAddr, vaultAbi, "deposit", [amount, DEAD]);
  console.log(`Đã gửi mồi 1.000 mUSDC vào vault. Giao dịch: https://testnet.snowtrace.io/tx/${hash}`);
  process.exit(0);
}

// ---- tạo lãi giả
const yieldIdx = process.argv.indexOf("--yield");
if (yieldIdx !== -1) {
  const amount = process.argv[yieldIdx + 1] ?? "5";
  if (!deployments.contracts.MockVault) throw new Error("Bản deploy hiện tại không có vault");
  const key = env.KEEPER_PRIVATE_KEY;
  if (!key) throw new Error("Thiếu KEEPER_PRIVATE_KEY trong web/.env.local");
  const keeper = createWalletClient({ chain, transport: http(RPC), account: privateKeyToAccount(key) });
  const hash = await keeper.writeContract({
    address: deployments.contracts.MockVault,
    abi: vaultAbi,
    functionName: "simulateYield",
    args: [parseUnits(amount, 6)],
  });
  await pub.waitForTransactionReceipt({ hash });
  console.log(`Đã tạo ${amount} mUSDC lãi giả trong vault. Giao dịch: https://testnet.snowtrace.io/tx/${hash}`);
  process.exit(0);
}

// ---- tạo phòng mẫu
const key = env.DEMO_LANDLORD_PRIVATE_KEY;
if (!key) throw new Error("Thiếu DEMO_LANDLORD_PRIVATE_KEY trong web/.env.local (ví chủ trọ mẫu)");
const landlord = createWalletClient({ chain, transport: http(RPC), account: privateKeyToAccount(key) });
const me = landlord.account.address;
const { rooms } = JSON.parse(readFileSync(join(root, "scripts/demo/rooms.json"), "utf8"));
const photoDir = join(root, "scripts/demo/photos");

async function api(path, init = {}) {
  const res = await fetch(API + path, { ...init, headers: { ...(init.headers ?? {}), "x-dev-wallet": me } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path} → ${res.status} ${body?.error?.message ?? ""}. Server có đang chạy với AUTH_DEV_BYPASS=1 không?`);
  return body;
}
async function upload(file, purpose) {
  const path = join(photoDir, file);
  if (!existsSync(path)) throw new Error(`Thiếu ảnh ${path}`);
  const form = new FormData();
  form.set("file", new Blob([readFileSync(path)]), file);
  form.set("purpose", purpose);
  form.set("capturedAt", new Date().toISOString());
  return (await api("/uploads", { method: "POST", body: form })).photoId;
}

const now = Math.floor(Date.now() / 1000);
for (const r of rooms) {
  const moveIn = new Date((now + r.moveInInDays * 86400) * 1000);
  const leaseEnd = new Date(moveIn.getTime() + r.leaseMonths * 30 * 86400 * 1000);
  const body = {
    room: r.room,
    listingPhotoIds: await Promise.all(r.listingPhotos.map((f) => upload(f, "listing"))),
    money: r.money,
    dates: { moveInDate: moveIn.toISOString(), leaseEnd: leaseEnd.toISOString() },
    positions: await Promise.all(
      r.positions.map(async (p) => ({ name: p.name, instruction: p.instruction, examplePhotoId: await upload(p.examplePhoto, "example") })),
    ),
    priceList: r.priceList,
    yieldEnabled: r.yieldEnabled,
  };
  const listing = await api("/listings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const a = listing.createDealArgs;
  const hash = await landlord.writeContract({
    address: deployments.contracts.DepositEscrow,
    abi: escrowAbi,
    functionName: "createDeal",
    args: [BigInt(a.deposit), BigInt(a.reserveFee), BigInt(a.moveInDate), BigInt(a.leaseEnd), a.yieldEnabled, a.termsHash],
  });
  const rc = await pub.waitForTransactionReceipt({ hash });
  const created = rc.logs
    .map((l) => {
      try {
        return decodeEventLog({ abi: escrowAbi, data: l.data, topics: l.topics });
      } catch {
        return null;
      }
    })
    .find((e) => e?.eventName === "DealCreated");
  const dealId = Number(created.args.id);
  await api(`/listings/${listing.listingId}/onchain`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dealId, txHash: hash }),
  });
  console.log(`Phòng #${dealId}: ${r.room.title}`);
}
console.log("Xong. Mở app → Tôi thuê phòng để xem.");
