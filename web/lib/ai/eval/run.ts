import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, extname, resolve, relative, isAbsolute } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import terms from "../../../../shared/samples/terms.json";
import { casesSchema, score, summarize, toCsv, type EvalRow } from "./evaluation";

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: {
  cases: { type: "string", default: "cases.json" }, models: { type: "string" },
  "dry-run": { type: "boolean" }, "allow-provisional": { type: "boolean" },
}});
async function main() {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  const path = resolve(here, values.cases!);
  const input: unknown = JSON.parse(readFileSync(path, "utf8"));
  // Các cases.json cũ mặc định là damage, nhưng nhãn chưa được xác nhận.
  const cases = casesSchema.parse(Array.isArray(input) ? input.map(c => ({ task: "damage", ...c })) : input);
  if (cases.some(c => c.labelStatus !== "reviewed") && !values["allow-provisional"])
    throw new Error("Có nhãn chưa được người kiểm tra xác nhận. Dùng --allow-provisional để chạy bộ tham khảo.");
  const damage = cases.filter(c => c.task === "damage");
  if (damage.length && (damage.length < 10 || new Set(damage.map(c => c.expectVerdict)).size !== 4))
    throw new Error("Bộ damage cần ít nhất 10 cặp, đủ NEW_DAMAGE/WEAR/NO_CHANGE/UNCLEAR.");
  const listing = cases.filter(c => c.task === "listing");
  if (listing.length && new Set(listing.map(c => c.expectVerdict)).size !== 3)
    throw new Error("Bộ listing cần đủ MATCH/MISMATCH/UNCLEAR.");
  const { imagePart } = await import("../providers");
  function dataUrl(rel: string) {
    const root = dirname(path), file = resolve(root, rel), local = relative(root, file);
    if (local.startsWith("..") || isAbsolute(local)) throw new Error("Ảnh phải nằm trong thư mục bộ đánh giá.");
    const ext = extname(file).toLowerCase();
    if (![".png", ".jpg", ".jpeg"].includes(ext)) throw new Error("Ảnh đánh giá cần là JPG/PNG.");
    const data = readFileSync(file);
    if (!(ext === ".png" ? data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : data[0] === 255 && data[1] === 216))
      throw new Error("Nội dung ảnh không khớp định dạng.");
    const url = `data:image/${ext === ".png" ? "png" : "jpeg"};base64,${data.toString("base64")}`;
    imagePart(url); return url;
  }
  for (const c of cases) { dataUrl(c.before); dataUrl(c.after); }
  if (values["dry-run"]) { console.log(`Đã kiểm tra ${cases.length} ca và ảnh; không gọi API.`); return; }
  const models = [...new Set((values.models ?? process.env.AI_MODEL ?? "").split(",").map(s => s.trim()).filter(Boolean))];
  if (!models.length || models.includes("mock") || !process.env.AI_API_KEY?.trim()) throw new Error("Cần model thật và AI_API_KEY.");
  const { compareDamage, compareListing } = await import("../index");
  const { DAMAGE_PROMPT_VERSION, LISTING_PROMPT_VERSION } = await import("../prompts");
  const rows: EvalRow[] = [];
  const startedAt = new Date().toISOString();
  const dir = join(here, "results", startedAt.replaceAll(":", "-") + "-" + process.pid);
  mkdirSync(dir, { recursive: true });
  function save() {
    writeFileSync(join(dir, "results.json"), JSON.stringify({ startedAt, dataset: path,
      qualification: cases.some(c => c.labelStatus !== "reviewed") ? "PROVISIONAL: không dùng để khẳng định độ chính xác thực tế" : "Nhãn được khai báo reviewed; nguồn ảnh vẫn cần kiểm tra",
      summary: summarize(rows), rows }, null, 2));
    writeFileSync(join(dir, "results.csv"), toCsv(rows));
  }
  const originalModel = process.env.AI_MODEL;
  try {
    for (const model of models) {
      process.env.AI_MODEL = model;
      for (const c of cases) {
        const start = performance.now();
        const row: EvalRow = { name: c.name, task: c.task, model,
          promptVersion: c.task === "damage" ? DAMAGE_PROMPT_VERSION : LISTING_PROMPT_VERSION,
          expected: c.expectVerdict, predicted: null, labelStatus: c.labelStatus,
          labelMatch: false, fieldsMatch: false, durationMs: 0, error: null, output: null };
        try {
          const positions = [{ positionId: c.positionId, name: c.positionName, beforeUrl: dataUrl(c.before), afterUrl: dataUrl(c.after) }];
          const out = c.task === "damage" ? (await compareDamage({ positions, priceList: terms.priceList })).positions[0]
            : await compareListing({ positions });
          Object.assign(row, score(c, out), { predicted: out.verdict, output: out });
        } catch (error) {
          // Chỉ lỗi từ lớp provider đã làm sạch được ghi ra báo cáo.
          row.error = error instanceof Error && /^(AI_FAILED|Thiếu AI_API_KEY)/.test(error.message) ? error.message : "Không hoàn thành ca kiểm thử; kiểm tra cấu hình và đầu vào.";
        }
        row.durationMs = Math.round(performance.now() - start);
        rows.push(row); save();
        console.log(`${model} | ${c.name} | ${row.error ? "ERROR" : row.fieldsMatch ? "ĐÚNG" : "SAI"} | ${row.durationMs}ms`);
      }
    }
  } finally {
    if (originalModel === undefined) delete process.env.AI_MODEL; else process.env.AI_MODEL = originalModel;
  }
  console.log(JSON.stringify(summarize(rows), null, 2));
  console.log(`Đã lưu: ${dir}`);
  if (rows.some(r => r.error || !r.fieldsMatch)) process.exitCode = 1;
}
main().catch(() => {
  console.error("Không chạy được eval: kiểm tra file cases, đủ nhãn, labelStatus, ảnh JPG/PNG <=5MB và cấu hình model/key. Xem README.");
  process.exitCode = 1;
});
