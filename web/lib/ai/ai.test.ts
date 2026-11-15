import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { compareDamage, compareListing } from "./index";
import { explainDamage } from "../llm/explain";
import { imagePart } from "./providers";

const originalFetch = globalThis.fetch;
const oldEnv = { AI_MODEL: process.env.AI_MODEL, AI_API_KEY: process.env.AI_API_KEY, OPENAI_API_KEY: process.env.OPENAI_API_KEY };
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
const position = { positionId: "p1", name: "Tường", beforeUrl: "data:image/png;base64,YQ==", afterUrl: "data:image/png;base64,Yg==" };
const priceList = [{ id: "i1", item: "Sơn tường", unit: "mảng", priceAmount: "16000000" }];
const output = { positionId: "p1", verdict: "NEW_DAMAGE", confidence: 0.9, description: "Có vết nứt mới.", priceItemId: "i1", quantity: 1, outsidePriceList: false };
function setup() { process.env.AI_MODEL = "gemini-4-hydrogen"; process.env.AI_API_KEY = "test-only"; }
function response(value: unknown) { return Response.json({ status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(value) }] }] }); }

test("hai ảnh đúng thứ tự; Gemini không nhận giá tiền", async () => {
  setup();
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.input[3].data, "YQ==");
    assert.equal(body.input[5].data, "Yg==");
    assert.ok(!JSON.stringify(body).includes("16000000"));
    return response(output);
  };
  assert.equal((await compareDamage({ positions: [position], priceList })).positions[0].priceItemId, "i1");
});
test("confidence thấp không tạo hạng mục khấu trừ", async () => {
  setup(); globalThis.fetch = async () => response({ ...output, confidence: 0.3 });
  const out = (await compareDamage({ positions: [position], priceList })).positions[0];
  assert.equal(out.verdict, "UNCLEAR"); assert.equal(out.priceItemId, null); assert.equal(out.quantity, 0);
});
test("hao mòn luôn xóa mục khấu trừ", async () => {
  setup(); globalThis.fetch = async () => response({ ...output, verdict: "WEAR" });
  const out = (await compareDamage({ positions: [position], priceList })).positions[0];
  assert.equal(out.priceItemId, null); assert.equal(out.quantity, 0);
});
test("mã bảng giá bịa đặt bị từ chối sau tối đa 2 lần", async () => {
  setup(); let calls = 0;
  globalThis.fetch = async () => { calls++; return response({ ...output, priceItemId: "invented" }); };
  await assert.rejects(compareDamage({ positions: [position], priceList }), /AI_FAILED/);
  assert.equal(calls, 2);
});
test("sai positionId bị từ chối", async () => {
  setup(); globalThis.fetch = async () => response({ ...output, positionId: "p2" });
  await assert.rejects(compareDamage({ positions: [position], priceList }), /AI_FAILED/);
});
test("JSON lỗi được thử lại", async () => {
  setup(); let calls = 0;
  globalThis.fetch = async () => { calls++; return response(calls === 1 ? {} : output); };
  await compareDamage({ positions: [position], priceList }); assert.equal(calls, 2);
});
test("ngoài bảng giá hợp lệ không có mã và số lượng", async () => {
  setup(); globalThis.fetch = async () => response({ ...output, priceItemId: null, quantity: 0, outsidePriceList: true });
  assert.equal((await compareDamage({ positions: [position], priceList })).positions[0].outsidePriceList, true);
});
test("thiếu key dừng trước khi gửi mạng", async () => {
  setup(); delete process.env.AI_API_KEY;
  globalThis.fetch = async () => { throw new Error("Không được gọi mạng"); };
  await assert.rejects(compareDamage({ positions: [position], priceList }), /Thiếu AI_API_KEY/);
});
test("HTTP lỗi không lộ nội dung provider", async () => {
  setup(); globalThis.fetch = async () => new Response("secret-provider-body", { status: 401 });
  await assert.rejects(compareDamage({ positions: [position], priceList }), e => e instanceof Error && /401/.test(e.message) && !e.message.includes("secret"));
});
test("listing không chắc có kết quả UNCLEAR", async () => {
  setup(); globalThis.fetch = async () => response({ verdict: "MISMATCH", confidence: 0.4, reasons: ["Khác góc chụp"] });
  assert.equal((await compareListing({ positions: [position] })).verdict, "UNCLEAR");
});
test("listing nhiều cặp giữ bằng chứng khác biệt rõ", async () => {
  setup(); let calls = 0;
  globalThis.fetch = async () => response({ verdict: ++calls === 1 ? "MATCH" : "MISMATCH", confidence: 0.9, reasons: ["Đối chiếu cấu trúc"] });
  assert.equal((await compareListing({ positions: [position, { ...position, positionId: "p2" }] })).verdict, "MISMATCH");
});
test("không gửi ảnh trống, http hay base64 sai", () => {
  assert.throws(() => imagePart("http://localhost/x.jpg"));
  assert.throws(() => imagePart("data:image/png;base64,?"));
  assert.throws(() => imagePart(""));
});
test("OpenAI chỉ nhận báo cáo chữ; không sửa báo cáo gốc", async () => {
  process.env.OPENAI_API_KEY = "test-only";
  const report = { model: "gemini-4-hydrogen", promptVersion: "damage-v1", positions: [output as Awaited<ReturnType<typeof compareDamage>>["positions"][number]] };
  const before = JSON.stringify(report);
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.input, before); assert.equal(body.store, false);
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Có hư hỏng mới theo báo cáo." }] }] });
  };
  assert.equal((await explainDamage(report)).advisoryOnly, true);
  assert.equal(JSON.stringify(report), before);
});
test("OpenAI từ chối hoặc trả thiếu nội dung là lỗi", async () => {
  process.env.OPENAI_API_KEY = "test-only";
  globalThis.fetch = async () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] });
  await assert.rejects(explainDamage({ model: "x", promptVersion: "x", positions: [{ ...output, verdict: "NEW_DAMAGE" }] }), /không trả/);
});
