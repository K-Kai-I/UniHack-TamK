// Test kiểm tra chất lượng khung hình. Chạy: node --import tsx --test lib/client/photo-quality.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFrame, frameMessage, toLuma } from "./photo-quality";

const fill = (n: number, y: number) => new Uint8Array(n).fill(y);

test("đổi RGBA sang độ sáng: trắng 255, đen 0", () => {
  assert.deepEqual(
    [...toLuma(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]))],
    [255, 0],
  );
});

test("phòng đủ sáng, máy đứng yên: đạt", () => {
  const f = fill(1000, 120);
  assert.deepEqual(checkFrame(f, f), { ok: true, issues: [] });
});

test("ảnh tối (giống ca 03 của bộ test, sáng trung bình ~20): báo tối", () => {
  const r = checkFrame(fill(1000, 20));
  assert.deepEqual(r.issues, ["dark"]);
  assert.match(frameMessage(r), /bật đèn/);
});

test("đa số điểm ảnh tối dù có vài chỗ rất sáng: vẫn báo tối", () => {
  const f = fill(1000, 10).fill(255, 0, 300); // 70% tối, trung bình ~84
  assert.ok(checkFrame(f).issues.includes("dark"));
});

test("quá nửa khung cháy sáng: báo chói", () => {
  assert.deepEqual(checkFrame(fill(1000, 120).fill(255, 0, 300)).issues, [
    "glare",
  ]);
});

test("hai khung liền nhau khác nhiều: máy rung; khác ít: không", () => {
  assert.deepEqual(checkFrame(fill(1000, 140), fill(1000, 100)).issues, [
    "shake",
  ]);
  assert.deepEqual(checkFrame(fill(1000, 105), fill(1000, 100)).issues, []);
});

test("khung trước khác kích thước (vừa xoay máy): bỏ qua phép đo rung", () => {
  assert.deepEqual(checkFrame(fill(1000, 140), fill(500, 100)).issues, []);
});
