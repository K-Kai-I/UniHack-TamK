// Schema zod cho đầu ra của mô hình AI. Khớp docs/data-contract.md.
import { z } from "zod";

/** Mô hình trả cho MỘT vị trí. Không có tiền: API tự nhân đơn giá. */
export const damagePositionOutput = z.object({
  positionId: z.string(),
  verdict: z.enum(["NEW_DAMAGE", "WEAR", "NO_CHANGE", "UNCLEAR"]),
  confidence: z.number().min(0).max(1),
  description: z.string().min(1),
  priceItemId: z.string().nullable(),
  quantity: z.number().int().min(0),
  outsidePriceList: z.boolean(),
});
export type DamagePositionOutput = z.infer<typeof damagePositionOutput>;

export const listingOutput = z.object({
  verdict: z.enum(["MATCH", "UNCLEAR", "MISMATCH"]),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()),
});
export type ListingOutput = z.infer<typeof listingOutput>;
