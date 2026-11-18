import "server-only";
import { z } from "zod";

export class AiRequestError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly retryAfterMs = 1000) {
    super(message);
  }
}

function retryDelay(value: string | null) {
  if (!value) return 1000;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(ms) ? Math.max(0, ms) : 1000;
}

/** Mỗi lần gọi tối đa 30 giây: backend cho cả báo cáo 50 giây (Vercel cắt hàm ở 60 giây),
 *  nên lần thử lại vẫn còn chỗ. Model lite thường trả trong 3–10 giây. */
const CALL_TIMEOUT_MS = 30_000;

export async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body), signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch {
    throw new AiRequestError(`Không kết nối được AI hoặc quá ${CALL_TIMEOUT_MS / 1000} giây. Hãy thử lại.`, true);
  }
  // Không đưa response thô hoặc headers vào lỗi: chúng có thể chứa dữ liệu riêng tư.
  if (!response.ok) {
    const status = response.status;
    const hint = status === 429 ? "Đạt giới hạn tốc độ hoặc hạn mức; kiểm tra dashboard."
      : status >= 500 ? "Dịch vụ AI đang lỗi hoặc quá tải; thử lại sau."
      : status === 401 || status === 403 ? "Kiểm tra API key và quyền truy cập model."
      : "Kiểm tra model và định dạng yêu cầu.";
    const delay = retryDelay(response.headers.get("retry-after"));
    // Không thử sớm hơn Retry-After; trả lỗi nếu thời gian chờ vượt ngân sách.
    throw new AiRequestError(`Dịch vụ AI trả HTTP ${status}. ${hint}`,
      [408, 429, 500, 502, 503, 504].includes(status) && delay <= 10_000, delay);
  }
  try { return await response.json() as unknown; }
  catch { throw new AiRequestError("Dịch vụ AI trả phản hồi không phải JSON hợp lệ.", true); }
}

export function imagePart(url: string) {
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  if (match) {
    const data = Buffer.from(match[2], "base64");
    if (!data.length || data.length > 5 * 1024 * 1024 || data.toString("base64") !== match[2]) {
      throw new Error("Ảnh phải có dữ liệu base64 hợp lệ và không quá 5 MB.");
    }
    return { type: "image", mime_type: match[1], data: match[2] };
  }
  // Gửi URL trực tiếp cho Gemini, không fetch URL do người dùng cung cấp trên server.
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Ảnh cần là data URL JPEG/PNG hoặc URL HTTPS."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("URL ảnh phải dùng HTTPS và không chứa tài khoản/mật khẩu.");
  }
  return { type: "image", uri: parsed.href };
}

const geminiResponse = z.object({
  status: z.literal("completed"),
  steps: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
  })),
});

export async function geminiJson<T>(input: unknown[], schema: object, parse: (value: unknown) => T): Promise<T> {
  const key = process.env.AI_API_KEY?.trim();
  if (!key) throw new Error("Thiếu AI_API_KEY trong web/.env.local (khóa Gemini).");
  const model = process.env.AI_MODEL?.trim();
  if (!model || model === "mock") throw new Error("Đặt AI_MODEL thành model Gemini được tài khoản hỗ trợ.");
  // Tối đa 2 lần gọi theo lỗi AI_FAILED trong docs/api-contract.md;
  // cũng không vượt giới hạn 2 lần thử lại của AGENTS.md.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await postJson("https://generativelanguage.googleapis.com/v1beta/interactions", {
        "x-goog-api-key": key, "Api-Revision": "2026-05-20",
      }, {
        model, store: false, input,
        response_format: { type: "text", mime_type: "application/json", schema },
      });
      const response = geminiResponse.parse(raw);
      const text = response.steps.filter(s => s.type === "model_output")
        .flatMap(s => s.content ?? []).filter(p => p.type === "text").map(p => p.text ?? "").join("");
      return parse(JSON.parse(text));
    } catch (error) {
      if (error instanceof AiRequestError && !error.retryable) throw new Error(`AI_FAILED: ${error.message}`);
      // Ghi lý do câu trả lời bị loại (không ghi ảnh hay câu trả lời thô) để còn biết vì sao lỗi.
      if (!(error instanceof AiRequestError)) console.warn("[ai] câu trả lời không hợp lệ:", String((error as Error)?.message ?? error).slice(0, 300));
      if (attempt === 1) throw new Error(error instanceof AiRequestError
        ? `AI_FAILED: ${error.message} Đã thử 2 lần.`
        : "AI_FAILED: Gemini không trả kết quả hợp lệ sau 2 lần gọi.");
      await new Promise(resolve => setTimeout(resolve, error instanceof AiRequestError ? error.retryAfterMs : 1000));
    }
  }
  throw new Error("AI_FAILED");
}
