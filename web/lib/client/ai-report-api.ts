// Kết quả AI so ảnh trước/sau (docs/api-contract.md > POST và GET /deals/:dealId/ai/damage).
// GET công khai: cả hai bên cùng thấy một báo cáo. Chủ trọ cần thêm `seal` (con dấu) để ký proposeDeduction.
// AI không chạm tiền (AGENTS.md luật 2): `amount` trong báo cáo do API nhân đơn giá, `seal.aiAmount` = sealedAmount.
import type { AiJobStatus, DamageReport, DamageSeal, Hash } from "@/lib/types";
import { apiFetch } from "./api";
import { DEALS_MOCK, MOCK_EXPLANATION, mockAiStatus, mockDamageReport } from "./deals-data";

export { startDamageAi } from "./photo-sets-api";

export interface DamageAiResponse {
  // TODO(spec): api-contract chỉ liệt kê processing | done | failed; server trả thêm "none" khi chưa ai chạy AI.
  status: AiJobStatus | "none";
  report: DamageReport | null;
  seal: DamageSeal | null;
  /** Lời giải thích thêm (OpenAI), chỉ tham khảo, không nằm trong báo cáo đã ký. */
  explanation?: string | null;
  error?: string;
}

/** GET /deals/:dealId/ai/damage. Hỏi lại định kỳ khi status = processing. */
export async function fetchDamageAi(dealId: number): Promise<DamageAiResponse> {
  if (DEALS_MOCK) return mockDamageAi(dealId);
  return apiFetch<DamageAiResponse>(`/deals/${dealId}/ai/damage`);
}

// ------------------------------------------------------------------ bản giả

const H = (n: string) => `0x${n.repeat(64).slice(0, 64)}` as Hash;

async function mockDamageAi(dealId: number): Promise<DamageAiResponse> {
  await new Promise((r) => setTimeout(r, 300));
  const status = mockAiStatus(dealId);
  if (status === null) return { status: "none", report: null, seal: null };
  if (status === "processing") return { status, report: null, seal: null };
  if (status === "failed") return { status, report: null, seal: null, error: "Mô hình AI không trả lời (dữ liệu giả)." };
  const report = mockDamageReport(dealId);
  return {
    status,
    report,
    explanation: MOCK_EXPLANATION,
    // Con dấu GIẢ: chỉ để hiện giao diện. Contract sẽ từ chối (BadSignature) nếu đem ký thật.
    seal: {
      dealId,
      checkInHash: report.checkInHash,
      checkOutHash: report.checkOutHash,
      aiAmount: report.sealedAmount,
      reportHash: H("e"),
      signature: `0x${"ab".repeat(65)}`,
      signer: `0x${"5".repeat(40)}`,
    },
  };
}
