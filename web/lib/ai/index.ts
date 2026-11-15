// API công khai giữ nguyên theo docs/api-contract.md. Chỉ chạy ở server.
import "server-only";
import { z } from "zod";
import type { PriceItem } from "../types";
import { damagePositionOutput, listingOutput, type DamagePositionOutput, type ListingOutput } from "./schema";
import { geminiJson, imagePart } from "./providers";
import { DAMAGE_PROMPT, LISTING_PROMPT, damageJsonSchema, listingJsonSchema } from "./prompts";
import { DAMAGE_PROMPT_VERSION, LISTING_PROMPT_VERSION } from "./prompts";
export { DAMAGE_PROMPT_VERSION, LISTING_PROMPT_VERSION } from "./prompts";

export type PositionInput = { positionId: string; name: string; beforeUrl: string; afterUrl: string };
export const MODEL = process.env.AI_MODEL ?? "mock";

const positionsSchema = z.array(z.object({
  positionId: z.string().min(1).max(100), name: z.string().min(1).max(300),
  beforeUrl: z.string().min(1).max(8_000_000), afterUrl: z.string().min(1).max(8_000_000),
})).min(1).max(20).refine(ps => new Set(ps.map(p => p.positionId)).size === ps.length, "Trùng positionId");
const pricesSchema = z.array(z.object({
  id: z.string().min(1), item: z.string().min(1).max(300), unit: z.string().min(1).max(100),
  priceAmount: z.string().regex(/^\d+$/),
})).max(100).refine(ps => new Set(ps.map(p => p.id)).size === ps.length, "Trùng mã bảng giá");

function pair(p: PositionInput) {
  return [
    { type: "text", text: JSON.stringify({ positionId: p.positionId, name: p.name, image: "TRƯỚC" }) },
    imagePart(p.beforeUrl), { type: "text", text: "SAU" }, imagePart(p.afterUrl),
  ];
}

/** Không tính tiền, đọc database, ký hay gọi contract. */
export async function compareDamage(input: { positions: PositionInput[]; priceList: PriceItem[] }):
Promise<{ model: string; promptVersion: string; positions: DamagePositionOutput[] }> {
  const source = positionsSchema.parse(input.positions);
  const prices = pricesSchema.parse(input.priceList);
  const model = process.env.AI_MODEL ?? "mock";
  if (model === "mock") return {
    model, promptVersion: "damage-v0", positions: source.map(p => ({
      positionId: p.positionId, verdict: "UNCLEAR", confidence: 0,
      description: "Bản giả: chưa nối mô hình AI", priceItemId: null, quantity: 0, outsidePriceList: false,
    })),
  };
  const positions: DamagePositionOutput[] = [];
  for (const p of source) {
    const result = await geminiJson([
      { type: "text", text: DAMAGE_PROMPT },
      // Không gửi đơn giá: Gemini chỉ cần tên hạng mục và đơn vị.
      { type: "text", text: JSON.stringify({ priceList: prices.map(({ id, item, unit }) => ({ id, item, unit })) }) },
      ...pair(p),
    ], damageJsonSchema, value => {
      const out = damagePositionOutput.strict().parse(value);
      if (out.positionId !== p.positionId) throw new Error("Sai positionId");
      if (out.confidence < 0.6) out.verdict = "UNCLEAR";
      if (out.verdict !== "NEW_DAMAGE") {
        return { ...out, priceItemId: null, quantity: 0, outsidePriceList: false };
      }
      if (out.outsidePriceList) {
        if (out.priceItemId !== null || out.quantity !== 0) throw new Error("Sai mục ngoài bảng giá");
      } else if (!prices.some(i => i.id === out.priceItemId) || !Number.isSafeInteger(out.quantity) || out.quantity < 1) {
        throw new Error("Mã hạng mục hoặc số lượng không hợp lệ");
      }
      return out;
    });
    positions.push(result);
  }
  return { model, promptVersion: DAMAGE_PROMPT_VERSION, positions };
}

export async function compareListing(input: { positions: PositionInput[] }):
Promise<{ model: string; promptVersion: string } & ListingOutput> {
  const source = positionsSchema.parse(input.positions);
  const model = process.env.AI_MODEL ?? "mock";
  if (model === "mock") return { model, promptVersion: "listing-v0", verdict: "UNCLEAR", confidence: 0, reasons: ["Bản giả: chưa nối mô hình AI"] };
  // Mỗi cặp một request để không vượt giới hạn dung lượng khi có nhiều ảnh.
  const results: ListingOutput[] = [];
  for (const p of source) {
    results.push(await geminiJson([{ type: "text", text: LISTING_PROMPT }, ...pair(p)], listingJsonSchema, v => {
      const out = listingOutput.strict().parse(v);
      if (!out.reasons.length || out.reasons.some(r => !r.trim())) throw new Error("Thiếu lý do");
      return { ...out, verdict: out.confidence < 0.6 ? "UNCLEAR" : out.verdict };
    }));
  }
  // TODO(spec): nhóm chốt quy tắc gộp nhiều cặp. Bản thử: có MISMATCH rõ thì MISMATCH;
  // nếu không, cần mọi cặp MATCH mới kết luận MATCH.
  const chosen = results.find(r => r.verdict === "MISMATCH") ?? results.find(r => r.verdict === "UNCLEAR");
  return {
    model, promptVersion: LISTING_PROMPT_VERSION, verdict: chosen?.verdict ?? "MATCH",
    confidence: chosen?.confidence ?? Math.min(...results.map(r => r.confidence)),
    reasons: results.flatMap((r, i) => r.reasons.map(reason => `${source[i].name}: ${reason}`)),
  };
}
