// Module AI: docs/api-contract.md > Module AI và docs/data-contract.md > Báo cáo hư hỏng.
// Chủ sở hữu: người làm AI. Chỉ export 2 hàm dưới đây.
// Luật: không tính tiền, không đọc database, không ký, không gọi contract. Không chắc thì UNCLEAR.
//
// Hiện đang là BẢN GIẢ (mock): trả kết quả cố định đúng schema để API và frontend làm trước.
// Thay phần thân hàm bằng lời gọi mô hình thật; giữ nguyên chữ ký và kiểu trả về.
import type { PriceItem } from "../types";
import { damagePositionOutput, listingOutput, type DamagePositionOutput, type ListingOutput } from "./schema";

export type PositionInput = {
  positionId: string;
  name: string;
  beforeUrl: string; // ảnh nhận phòng (hoặc ảnh đăng tin với compareListing)
  afterUrl: string; // ảnh trả phòng (hoặc ảnh thực tế)
};

export const MODEL = process.env.AI_MODEL ?? "mock";
export const DAMAGE_PROMPT_VERSION = "damage-v0";
export const LISTING_PROMPT_VERSION = "listing-v0";

/** So trước và sau. Trả phần positions của báo cáo hư hỏng, CHƯA có số tiền. */
export async function compareDamage(input: {
  positions: PositionInput[];
  priceList: PriceItem[];
}): Promise<{ model: string; promptVersion: string; positions: DamagePositionOutput[] }> {
  // TODO(AI): với mỗi vị trí, gửi cặp ảnh + bảng giá cho mô hình, bắt trả JSON đúng damagePositionOutput,
  // parse bằng zod, sai schema thì thử lại tối đa 2 lần rồi ném lỗi.
  const positions = input.positions.map((p) =>
    damagePositionOutput.parse({
      positionId: p.positionId,
      verdict: "UNCLEAR",
      confidence: 0,
      description: "Bản giả: chưa nối mô hình AI",
      priceItemId: null,
      quantity: 0,
      outsidePriceList: false,
    }),
  );
  return { model: MODEL, promptVersion: DAMAGE_PROMPT_VERSION, positions };
}

/** So ảnh đăng tin với ảnh thực tế lúc nhận phòng. */
export async function compareListing(input: {
  positions: PositionInput[];
}): Promise<{ model: string; promptVersion: string } & ListingOutput> {
  // TODO(AI): chỉ MISMATCH khi khác về cấu trúc phòng; khác ánh sáng, đồ nhỏ thì MATCH.
  void input;
  const out = listingOutput.parse({ verdict: "UNCLEAR", confidence: 0, reasons: ["Bản giả: chưa nối mô hình AI"] });
  return { model: MODEL, promptVersion: LISTING_PROMPT_VERSION, ...out };
}
