// Sau khi deploy lên Fuji: đọc kết quả forge trong contracts/broadcast rồi ghi shared/deployments.json.
// Chạy: cd contracts && npm run deploy:fuji  (lệnh đó gọi file này sau forge script)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = JSON.parse(readFileSync(join(root, "contracts/broadcast/Deploy.s.sol/43113/run-latest.json"), "utf8"));
const env = Object.fromEntries(
  readFileSync(join(root, "contracts/.env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);

const addr = (name) => {
  const tx = run.transactions.find((t) => t.contractName === name && t.transactionType === "CREATE");
  if (!tx) throw new Error(`Không thấy ${name} trong broadcast`);
  return tx.contractAddress;
};
const block = Math.min(...run.receipts.map((r) => Number(r.blockNumber)));

const path = join(root, "shared/deployments.json");
const old = JSON.parse(readFileSync(path, "utf8"));
const next = {
  chainId: 43113,
  abiVersion: (old.abiVersion ?? 0) + 1,
  deployedAt: new Date().toISOString(),
  deployBlock: block,
  contracts: { DepositEscrow: addr("DepositEscrow"), MockUSDC: addr("MockUSDC"), MockVault: null },
  aiSigner: env.AI_SIGNER_ADDRESS,
  feeRecipient: env.FEE_RECIPIENT_ADDRESS,
};
writeFileSync(path, JSON.stringify(next, null, 2) + "\n");
console.log("shared/deployments.json:", JSON.stringify(next, null, 2));
