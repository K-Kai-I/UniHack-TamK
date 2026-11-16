// Chép ABI từ contracts/out (sau forge build) sang shared/abi để web dùng.
// Chạy: cd contracts && npm run export-abi
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "shared", "abi");
mkdirSync(outDir, { recursive: true });

for (const name of ["DepositEscrow", "MockUSDC", "MockVault"]) {
  const artifact = JSON.parse(readFileSync(join(root, "contracts", "out", `${name}.sol`, `${name}.json`), "utf8"));
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(artifact.abi, null, 2) + "\n");
  console.log(`shared/abi/${name}.json: ${artifact.abi.length} mục`);
}

// Bản TypeScript có `as const` để wagmi/viem suy ra kiểu tham số hàm.
const ts = ["// Tự sinh bởi scripts/export-abi.mjs. Không sửa tay.", ""];
for (const name of ["DepositEscrow", "MockUSDC", "MockVault"]) {
  const abi = readFileSync(join(outDir, `${name}.json`), "utf8").trim();
  const id = { DepositEscrow: "escrowAbi", MockUSDC: "usdcAbi", MockVault: "vaultAbi" }[name];
  ts.push(`export const ${id} = ${abi} as const;`, "");
}
writeFileSync(join(root, "web", "lib", "abi.ts"), ts.join("\n"));
console.log("web/lib/abi.ts: đã cập nhật");
