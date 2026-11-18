// Chạy từ web/: npm run ai:demo -- before.jpg after.jpg "Tên vị trí"
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { loadEnvFile } from "node:process";

function image(path: string) {
  const absolute = resolve(path);
  if (!existsSync(absolute)) throw new Error(`Không tìm thấy ảnh: ${absolute}`);
  const mime = ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" } as Record<string, string>)[extname(path).toLowerCase()];
  if (!mime) throw new Error("Dùng ảnh JPG hoặc PNG.");
  const data = readFileSync(absolute);
  if (!data.length || data.length > 5 * 1024 * 1024) throw new Error("Ảnh phải có dữ liệu và không quá 5 MB.");
  return `data:${mime};base64,${data.toString("base64")}`;
}

async function main() {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  const [before, after, name = "Vị trí thử nghiệm", ...flags] = process.argv.slice(2);
  if (!before || !after) throw new Error('Cách chạy: npm run ai:demo -- "ảnh-trước.jpg" "ảnh-sau.jpg" "Tên vị trí" [--no-explain] [--listing]');
  if (!process.env.AI_MODEL || process.env.AI_MODEL === "mock") throw new Error("Đặt AI_MODEL=gemini-3.5-flash-lite trong web/.env.local trước khi demo thật.");
  // Dynamic import: nạp .env.local trước khi module đọc biến môi trường.
  const { compareDamage, compareListing } = await import("./index");
  const positions = [{ positionId: "p1", name, beforeUrl: image(before), afterUrl: image(after) }];
  if (flags.includes("--listing")) {
    console.log(JSON.stringify(await compareListing({ positions }), null, 2));
    return;
  }
  // Bảng giá riêng cho demo; không sửa dữ liệu mẫu của cả nhóm.
  const priceList = JSON.parse(readFileSync(new URL("./demo-price-list.json", import.meta.url), "utf8"));
  console.log("Đang gửi hai ảnh cho Gemini...");
  const report = await compareDamage({ positions, priceList });
  console.log("BÁO CÁO GEMINI (chưa tính tiền):\n", JSON.stringify(report, null, 2));
  if (flags.includes("--no-explain")) return;
  try {
    const { explainDamage } = await import("../llm/explain");
    const explanation = await explainDamage(report);
    console.log(`\nGIẢI THÍCH THAM KHẢO (${explanation.model}):\n${explanation.text}`);
  } catch (error) {
    console.error("Gemini đã xong; phần OpenAI chưa chạy được:", error instanceof Error ? error.message : "Lỗi không xác định");
    process.exitCode = 1;
  }
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : "Không chạy được demo.");
  process.exitCode = 1;
});
