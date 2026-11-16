// AI so ảnh đăng tin với ảnh thực tế, nhánh C "Phòng không đúng mô tả" (docs/api-contract.md > POST /deals/:id/ai/mismatch).
// Luồng: POST /uploads (purpose=mismatch) từng vị trí → POST /photo-sets (kind=mismatch) → POST ở đây (photoSetId)
// → GET tới khi done/failed → người thuê ký reportMismatch(id, seal.verdict, seal.evidenceHash, seal.reportHash, seal.signature).
// AI chỉ trả kết luận (AGENTS.md luật 2); con dấu do server ký, frontend mang nguyên lên contract.
import type { AiJobStatus, Hash, MismatchReport, MismatchSeal } from "@/lib/types";
import { apiFetch } from "./api";
import { DEALS_MOCK, mockMismatchReport } from "./deals-data";

export interface MismatchAiResponse {
  // TODO(spec): api-contract chỉ liệt kê processing | done | failed; server trả thêm "none" khi chưa ai chạy AI.
  status: AiJobStatus | "none";
  report: MismatchReport | null;
  seal: (MismatchSeal & { signer?: string }) | null;
  error?: string;
}

/** Nhờ server chạy AI cho bộ ảnh đã khóa. Gọi lại khi đã có kết quả thì server trả kết quả cũ. */
export async function startMismatchAi(
  dealId: number,
  photoSetId: string,
  token: string | null,
): Promise<MismatchAiResponse> {
  if (DEALS_MOCK) {
    mockStartedAt.set(dealId, Date.now());
    await delay(300);
    return { status: "processing", report: null, seal: null };
  }
  return apiFetch<MismatchAiResponse>(`/deals/${dealId}/ai/mismatch`, {
    method: "POST",
    body: { photoSetId },
    token,
  });
}

/** GET /deals/:dealId/ai/mismatch. Hỏi lại định kỳ khi status = processing. */
export async function fetchMismatchAi(dealId: number): Promise<MismatchAiResponse> {
  if (DEALS_MOCK) return mockMismatchAi(dealId);
  return apiFetch<MismatchAiResponse>(`/deals/${dealId}/ai/mismatch`);
}

// ------------------------------------------------------------------ bản giả

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const H = (n: string) => `0x${n.repeat(64).slice(0, 64)}` as Hash;
/** Lúc bấm chạy AI (bản giả): AI "chạy xong" sau 6 giây. */
const mockStartedAt = new Map<number, number>();

async function mockMismatchAi(dealId: number): Promise<MismatchAiResponse> {
  await delay(300);
  const started = mockStartedAt.get(dealId);
  // Deal giả đã có báo cáo sẵn (30, 35) thì coi như xong từ trước.
  if (started === undefined && dealId !== 30 && dealId !== 35) return { status: "none", report: null, seal: null };
  if (started !== undefined && Date.now() - started < 6000) return { status: "processing", report: null, seal: null };
  const report = mockMismatchReport(dealId);
  return {
    status: "done",
    report,
    // Con dấu GIẢ: chỉ để hiện giao diện. Contract sẽ từ chối (BadSignature) nếu đem ký thật.
    seal: {
      dealId,
      termsHash: report.termsHash,
      evidenceHash: report.evidenceHash,
      verdict: 2,
      reportHash: H("e"),
      signature: `0x${"ab".repeat(65)}`,
    },
  };
}
