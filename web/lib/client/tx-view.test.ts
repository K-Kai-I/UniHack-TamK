// Test hành vi cho chữ trạng thái giao dịch/mạng/faucet (task UI 19). Chạy: node --import tsx --test lib/client/tx-view.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { describeTx, faucetError, isSlowPending, networkView, switchChainError } from "./tx-view";
import type { TxState } from "./use-tx";

const HASH = `0x${"a".repeat(64)}` as const;

test("idle không hiện gì", () => {
  assert.equal(describeTx({ phase: "idle" }), null);
});

test("hai pha chờ có bước, đang quay, và dặn đừng ký lại", () => {
  const signing = describeTx({ phase: "signing" })!;
  assert.equal(signing.step, "Bước 1/2");
  assert.ok(signing.busy);
  assert.match(signing.next, /Chưa có gì được gửi/);
  const pending = describeTx({ phase: "pending", hash: HASH })!;
  assert.equal(pending.step, "Bước 2/2");
  assert.match(pending.next, /Đừng ký lại/);
});

test("trả gas hộ được ghi ở mọi pha có hỏi tới", () => {
  assert.match(describeTx({ phase: "signing", sponsored: true })!.note, /Phí gas do app trả/);
  assert.match(describeTx({ phase: "pending", hash: HASH, sponsored: true })!.note, /Phí gas do app trả/);
  assert.match(describeTx({ phase: "success", hash: HASH, sponsored: true })!.note, /Phí gas do app trả/);
  assert.doesNotMatch(describeTx({ phase: "success", hash: HASH })!.note, /gas/);
});

test("thành công dùng doneText và không có lời khuyên", () => {
  const v = describeTx({ phase: "success", hash: HASH }, "Đã gửi đề xuất")!;
  assert.equal(v.title, "Đã gửi đề xuất");
  assert.equal(v.tone, "success");
  assert.equal(v.next, "");
});

test("lỗi chia ba loại theo bằng chứng, không theo chuỗi lỗi", () => {
  const reverted: TxState = { phase: "error", hash: HASH, reverted: true, error: "Giao dịch bị chuỗi từ chối (reverted)." };
  const unknown: TxState = { phase: "error", hash: HASH, error: "Mất kết nối mạng. Kiểm tra mạng rồi thử lại." };
  const unsent: TxState = { phase: "error", error: "Bạn đã hủy ký giao dịch." };
  const r = describeTx(reverted)!;
  const u = describeTx(unknown)!;
  const n = describeTx(unsent)!;
  assert.equal(r.title, "Chuỗi từ chối giao dịch");
  assert.match(r.next, /chưa đổi gì/);
  assert.match(r.next, /Phí gas/); // tự trả gas thì có thể đã mất phí
  assert.equal(u.title, "Chưa biết kết quả giao dịch");
  assert.match(u.next, /kiểm tra trước khi ký lại/);
  assert.equal(n.title, "Giao dịch chưa được gửi");
  assert.match(n.next, /Chưa có gì lên chuỗi/);
  for (const v of [r, u, n]) assert.equal(v.tone, "error");
  assert.equal(u.note, unknown.error); // lý do gốc luôn được giữ
});

test("revert khi trả gas hộ không nói phí đã bị tính", () => {
  const v = describeTx({ phase: "error", hash: HASH, reverted: true, sponsored: true, error: "x" })!;
  assert.doesNotMatch(v.next, /Phí gas/);
});

test("chuỗi chậm chỉ khi đang chờ xác nhận và qua ngưỡng", () => {
  const pending: TxState = { phase: "pending", hash: HASH };
  assert.equal(isSlowPending(pending, 29), false);
  assert.equal(isSlowPending(pending, 30), true);
  assert.equal(isSlowPending({ phase: "signing" }, 120), false);
  assert.equal(isSlowPending({ phase: "success", hash: HASH }, 120), false);
});

test("banner mạng: chỉ khi đã kết nối mà sai mạng", () => {
  assert.equal(networkView(false, 1, 43113).show, false);
  assert.equal(networkView(true, 43113, 43113).show, false);
  assert.deepEqual(networkView(true, 1, 43113), { show: true, currentLabel: "chain 1" });
  assert.deepEqual(networkView(true, undefined, 43113), { show: true, currentLabel: null });
});

test("lỗi chuyển mạng: từ chối ≠ ví không hỗ trợ, đều chỉ cách chuyển tay", () => {
  assert.match(switchChainError(new Error("User rejected the request."), "Avalanche Fuji", 43113), /từ chối chuyển mạng/);
  const other = switchChainError(new Error("Unsupported method"), "Avalanche Fuji", 43113);
  assert.match(other, /không tự chuyển được/);
  assert.match(other, /43113/);
});

test("lỗi faucet: đã nhận không cho thử lại ngay, lỗi mạng/máy chủ cho thử lại", () => {
  const rate = faucetError({ status: 429, code: "RATE_LIMITED", message: "x" });
  assert.equal(rate.kind, "rate");
  assert.equal(rate.retryable, false);
  assert.equal(faucetError({ status: 401, code: "UNAUTHORIZED" }).kind, "auth");
  assert.equal(faucetError({ status: 404, code: "UNKNOWN" }).kind, "missing");
  assert.equal(faucetError({ status: 0, code: "NETWORK" }).kind, "network");
  assert.equal(faucetError({ status: 502, code: "UNKNOWN" }).kind, "server");
  assert.ok(faucetError({ status: 502 }).retryable);
  assert.equal(faucetError({ status: 400, code: "UNKNOWN", message: "Ví không hợp lệ" }).message, "Ví không hợp lệ");
  assert.match(faucetError(null).message, /Không nhận được tiền test/);
});
