// Chấm module AI trên bộ ảnh thử: cd web && npm run ai:eval
// Chép cases.example.json thành cases.json, đặt ảnh vào lib/ai/eval/images/ (thư mục này không lên repo).
// Ảnh được gửi cho mô hình dưới dạng data URL để không cần upload.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import terms from "../../../../shared/samples/terms.json";

type Case = {
  name: string;
  positionId: string;
  positionName: string;
  before: string;
  after: string;
  expectVerdict: string;
  expectPriceItemId: string | null;
};

const here = dirname(fileURLToPath(import.meta.url));
if (existsSync(".env.local")) loadEnvFile(".env.local");
const file = existsSync(join(here, "cases.json")) ? "cases.json" : "cases.example.json";
const cases: Case[] = JSON.parse(readFileSync(join(here, file), "utf8"));

function dataUrl(rel: string) {
  const p = join(here, rel);
  if (!existsSync(p)) throw new Error(`Thiếu ảnh đánh giá: ${p}`);
  const mime = extname(p).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${readFileSync(p).toString("base64")}`;
}

async function main() {
if (!process.env.AI_MODEL || process.env.AI_MODEL === "mock") throw new Error("Đánh giá ảnh thật cần cấu hình AI_MODEL và AI_API_KEY.");
if (file === "cases.example.json" || cases.length < 10) throw new Error("Cần cases.json với ít nhất 10 cặp ảnh thật có nhãn; file example chỉ là mẫu.");
// Kiểm tra toàn bộ đường dẫn trước khi mất phí gọi AI cho cặp đầu tiên.
for (const c of cases) { dataUrl(c.before); dataUrl(c.after); }
const { compareDamage } = await import("../index");
let correct = 0;
for (const c of cases) {
  const r = await compareDamage({
    positions: [{ positionId: c.positionId, name: c.positionName, beforeUrl: dataUrl(c.before), afterUrl: dataUrl(c.after) }],
    priceList: terms.priceList,
  });
  const got = r.positions[0];
  const ok = got.verdict === c.expectVerdict && (got.priceItemId ?? null) === c.expectPriceItemId;
  if (ok) correct++;
  console.log(`${ok ? "ĐÚNG" : "SAI "}  ${c.name}: ${got.verdict} ${got.priceItemId ?? "-"} (mong đợi ${c.expectVerdict} ${c.expectPriceItemId ?? "-"})`);
}
console.log(`\n${correct}/${cases.length} đúng (${file})`);
if (correct !== cases.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Không chạy được đánh giá.");
  process.exit(1);
});
