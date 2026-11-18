import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { compareDamage, compareListing } from "./index";
import { explainDamage } from "../llm/explain";
import { imagePart } from "./providers";
import { casesSchema, score, summarize, toCsv, type EvalRow } from "./eval/evaluation";

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
test("mã bảng giá bịa đặt: giữ NEW_DAMAGE, chuyển thành ngoài bảng giá, không gọi lại", async () => {
  setup(); let calls = 0;
  globalThis.fetch = async () => { calls++; return response({ ...output, priceItemId: "invented" }); };
  const out = (await compareDamage({ positions: [position], priceList })).positions[0];
  assert.equal(out.verdict, "NEW_DAMAGE"); assert.equal(out.outsidePriceList, true);
  assert.equal(out.priceItemId, null); assert.equal(out.quantity, 0); assert.equal(calls, 1);
});
test("quên bật outsidePriceList (mã null) hoặc số lượng 0: chuyển thành ngoài bảng giá", async () => {
  setup();
  for (const bad of [{ priceItemId: null, quantity: 1 }, { priceItemId: "i1", quantity: 0 }]) {
    globalThis.fetch = async () => response({ ...output, ...bad });
    const out = (await compareDamage({ positions: [position], priceList })).positions[0];
    assert.deepEqual([out.verdict, out.outsidePriceList, out.priceItemId, out.quantity], ["NEW_DAMAGE", true, null, 0]);
  }
});
test("ngoài bảng giá nhưng lỡ ghi mã/số lượng: xóa mã và số lượng, không tạo khoản trừ", async () => {
  setup(); globalThis.fetch = async () => response({ ...output, priceItemId: "i1", quantity: 2, outsidePriceList: true });
  const out = (await compareDamage({ positions: [position], priceList })).positions[0];
  assert.deepEqual([out.outsidePriceList, out.priceItemId, out.quantity], [true, null, 0]);
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

test("503 được thử lại và phục hồi, không lộ response thô", async () => {
  setup(); let calls = 0;
  globalThis.fetch = async () => ++calls === 1
    ? new Response("secret", { status: 503, headers: { "retry-after": "0" } }) : response(output);
  assert.equal((await compareDamage({ positions: [position], priceList })).positions[0].verdict, "NEW_DAMAGE");
  assert.equal(calls, 2);
});
test("503 liên tiếp dừng sau hai lần và giải thích quá tải", async () => {
  setup(); let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("secret", { status: 503, headers: { "retry-after": "0" } }); };
  await assert.rejects(compareDamage({ positions: [position], priceList }), /AI_FAILED:.*503.*quá tải/);
  assert.equal(calls, 2);
});
test("401 và 400 không thử lại", async () => {
  setup();
  for (const status of [400, 401]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("secret", { status }); };
    await assert.rejects(compareDamage({ positions: [position], priceList }), /AI_FAILED/);
    assert.equal(calls, 1);
  }
});
test("429 tôn trọng Retry-After dài, không gọi ngay lần hai", async () => {
  setup(); let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("secret", { status: 429, headers: { "retry-after": "60" } }); };
  await assert.rejects(compareDamage({ positions: [position], priceList }), /429.*hạn mức/);
  assert.equal(calls, 1);
});
test("lỗi mạng và response không phải JSON được thử lại", async () => {
  setup();
  for (const kind of ["network", "json"]) {
    let calls = 0;
    globalThis.fetch = async () => {
      if (++calls === 1) { if (kind === "network") throw new Error("secret network"); return new Response("not-json"); }
      return response(output);
    };
    await compareDamage({ positions: [position], priceList }); assert.equal(calls, 2);
  }
});
test("listing: tất cả MATCH mới MATCH; một UNCLEAR thì không MATCH", async () => {
  setup();
  for (const verdict of ["MATCH", "UNCLEAR"] as const) {
    let calls = 0;
    globalThis.fetch = async () => response({ verdict: ++calls === 1 ? "MATCH" : verdict, confidence: 0.8, reasons: ["Quan sát cấu trúc"] });
    assert.equal((await compareListing({ positions: [position, { ...position, positionId: "p2" }] })).verdict, verdict);
  }
});
test("listing thiếu lý do bị từ chối", async () => {
  setup(); globalThis.fetch = async () => response({ verdict: "MATCH", confidence: 0.9, reasons: [" "] });
  await assert.rejects(compareListing({ positions: [position] }), /AI_FAILED/);
});
test("eval kiểm tra nhãn, số lượng và ngoài bảng giá riêng", () => {
  const c = casesSchema.parse([{ task: "damage", name: "test", positionId: "p1", positionName: "Tường", before: "a.jpg", after: "b.jpg", expectVerdict: "NEW_DAMAGE", expectPriceItemId: "i1", expectQuantity: 2, expectOutsidePriceList: false }])[0];
  assert.equal(c.labelStatus, "provisional");
  assert.deepEqual(score(c, output), { labelMatch: true, fieldsMatch: false });
  assert.equal(score(c, { ...output, quantity: 2 }).fieldsMatch, true);
  assert.throws(() => casesSchema.parse([{ ...c, expectVerdict: "WEAR" }]));
});
test("eval tách lỗi dịch vụ khỏi sai nhãn và bảo vệ CSV", () => {
  const base: EvalRow = { name: "=SUM(1)", task: "damage", model: "test", promptVersion: "v1", expected: "WEAR", predicted: "WEAR", labelStatus: "reviewed", labelMatch: true, fieldsMatch: true, durationMs: 20, error: null, output: null };
  const summary = summarize([base, { ...base, predicted: null, labelMatch: false, fieldsMatch: false, error: "503", durationMs: 100 }])[0];
  assert.equal(summary.valid, 1); assert.equal(summary.errors, 1); assert.equal(summary.labelMatches, 1);
  assert.equal(summary.medianMs, 20); assert.equal(summary.confusion.WEAR.ERROR, 1);
  assert.ok(toCsv([base]).includes("'=SUM(1)"));
});
