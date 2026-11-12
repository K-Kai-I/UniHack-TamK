// Chấm module AI trên bộ ảnh thử: cd web && npm run ai:eval
// Chép cases.example.json thành cases.json, đặt ảnh vào lib/ai/eval/images/ (thư mục này không lên repo).
// Ảnh được gửi cho mô hình dưới dạng data URL để không cần upload.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compareDamage } from "../index";
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
const file = existsSync(join(here, "cases.json")) ? "cases.json" : "cases.example.json";
const cases: Case[] = JSON.parse(readFileSync(join(here, file), "utf8"));

function dataUrl(rel: string) {
  const p = join(here, rel);
  if (!existsSync(p)) return `missing:${rel}`;
  return `data:image/jpeg;base64,${readFileSync(p).toString("base64")}`;
}

async function main() {
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
