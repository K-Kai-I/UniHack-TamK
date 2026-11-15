import "server-only";
import { z } from "zod";

export async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body), signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new Error("Không kết nối được AI hoặc quá 90 giây. Hãy thử lại.");
  }
  // Không đưa response thô hoặc headers vào lỗi: chúng có thể chứa dữ liệu riêng tư.
  if (!response.ok) throw new Error(`Dịch vụ AI trả HTTP ${response.status}. Kiểm tra API key, model và hạn mức.`);
  return response.json() as Promise<unknown>;
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
  if (!model || model === "mock") throw new Error("Đặt AI_MODEL=gemini-4-hydrogen để gọi Gemini thật.");
  // Tối đa 2 lần gọi theo lỗi AI_FAILED trong docs/api-contract.md;
  // cũng không vượt giới hạn 2 lần thử lại của AGENTS.md.
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await postJson("https://generativelanguage.googleapis.com/v1beta/interactions", {
      "x-goog-api-key": key, "Api-Revision": "2026-05-20",
    }, {
      model, store: false, input,
      response_format: { type: "text", mime_type: "application/json", schema },
    });
    try {
      const response = geminiResponse.parse(raw);
      const text = response.steps.filter(s => s.type === "model_output")
        .flatMap(s => s.content ?? []).filter(p => p.type === "text").map(p => p.text ?? "").join("");
      return parse(JSON.parse(text));
    } catch {
      if (attempt === 1) throw new Error("AI_FAILED: Gemini không trả kết quả hợp lệ sau 2 lần gọi.");
    }
  }
  throw new Error("AI_FAILED");
}
