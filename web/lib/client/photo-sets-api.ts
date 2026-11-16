// Luồng gửi ảnh nhận / trả phòng (docs/api-contract.md > "Ba luồng gọi chính" #2 và #3):
//   POST /uploads (từng vị trí) → POST /deals/:id/photo-sets (nhận setHash) → ví ký submitCheckIn / submitCheckOut
//   → (chỉ trả phòng) POST /deals/:id/ai/damage để AI bắt đầu so ảnh.
// setHash do API tính (AGENTS.md luật 5); frontend chỉ mang nguyên giá trị đó lên contract.
// API của Khải chưa xong thì chạy BẢN GIẢ (NEXT_PUBLIC_MOCK_API khác "0"); UI không đổi.
import type { Hash, PhotoSetKind } from "@/lib/types";
import { apiFetch } from "./api";

// TODO(spec): chưa có kiểu response của POST /photo-sets trong web/lib/types.ts. Khai báo tạm theo api-contract.
export interface PhotoSetResponse {
  photoSetId: string;
  setHash: Hash;
}

const USE_MOCK = process.env.NEXT_PUBLIC_MOCK_API !== "0";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Gom ảnh đã tải lên thành một bộ. Thiếu vị trí → ApiClientError 422 MISSING_POSITIONS. */
export async function createPhotoSet(
  dealId: number,
  body: { kind: PhotoSetKind; items: { positionId: string; photoId: string }[] },
  token: string | null,
): Promise<PhotoSetResponse> {
  if (USE_MOCK) {
    await delay(400);
    // Hash GIẢ: hash thật chỉ do API tính.
    return { photoSetId: `ps_mock_${Date.now()}`, setHash: `0x${"0".repeat(60)}beef` };
  }
  return apiFetch<PhotoSetResponse>(`/deals/${dealId}/photo-sets`, { method: "POST", body, token });
}

/** Sau khi submitCheckOut đã xác nhận: nhờ server chạy AI so trước/sau. Trả 202 { status: "processing" }. */
export async function startDamageAi(dealId: number, token: string | null): Promise<void> {
  if (USE_MOCK) {
    await delay(200);
    return;
  }
  await apiFetch(`/deals/${dealId}/ai/damage`, { method: "POST", token });
}
