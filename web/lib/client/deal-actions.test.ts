// Test hành vi: nút trên Chi tiết hợp đồng không được lỏng hơn contract sau hạn (task UI 21).
// Chạy: node --import tsx --test lib/client/deal-actions.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { actionsFor } from "./deal-actions";
import { nextStepFor } from "./deal-progress";
import { missingActionNote } from "./overdue";
import type { DealView } from "./deals-data";
import type { DealState } from "../types";

const T0 = Date.parse("2026-11-17T10:00:00Z");
const iso = (offsetMin: number) => new Date(T0 + offsetMin * 60_000).toISOString();

function deal(state: DealState, o: { deadline?: number; checkin?: boolean } = {}): DealView {
  return {
    dealId: 1,
    onchain: {
      state,
      deadline: o.deadline === undefined ? null : iso(o.deadline),
      checkInContested: false,
      disputeKind: null,
    },
    photoSets: { checkin: o.checkin ? { items: [] } : null, checkout: null },
  } as unknown as DealView;
}
const ids = (d: DealView, role: "tenant" | "landlord") => actionsFor(d, role, T0, null).map((a) => a.id);

test("RESERVED chưa ảnh: còn hạn thì một nút gửi ảnh (báo sai mô tả chọn sau khi chụp); quá hạn thì không còn", () => {
  assert.deepEqual(ids(deal("RESERVED", { deadline: 5 }), "tenant"), ["checkin"]);
  assert.deepEqual(ids(deal("RESERVED", { deadline: -1 }), "tenant"), []);
  assert.equal(nextStepFor(deal("RESERVED", { deadline: -1 }), "tenant", true).title, "Đã quá hạn gửi ảnh nhận phòng");
  assert.ok(missingActionNote(deal("RESERVED", { deadline: -1 }), "tenant", T0));
});

test("MISMATCH_REPORTED: chủ trọ chỉ phản đối được trước hạn; lời giải thích khớp nút", () => {
  assert.deepEqual(ids(deal("MISMATCH_REPORTED", { deadline: 5 }), "landlord"), ["contestMismatch"]);
  assert.deepEqual(ids(deal("MISMATCH_REPORTED", { deadline: -1 }), "landlord"), []);
  assert.match(missingActionNote(deal("MISMATCH_REPORTED", { deadline: -1 }), "landlord", T0) ?? "", /không còn/);
});

test("CHECKED_OUT: quá hạn thì bỏ nút đề xuất, vẫn xem được báo cáo", () => {
  assert.deepEqual(ids(deal("CHECKED_OUT", { deadline: 5 }), "landlord"), ["propose"]);
  assert.deepEqual(ids(deal("CHECKED_OUT", { deadline: -1 }), "landlord"), []);
  assert.equal(nextStepFor(deal("CHECKED_OUT", { deadline: -1 }), "landlord", true).title, "Đã quá hạn đề xuất");
});

test("PROPOSED quá hạn: vẫn mở được màn trả lời (acceptProposal không có hạn) nhưng không còn ghi là việc kháng nghị", () => {
  assert.deepEqual(ids(deal("PROPOSED", { deadline: -1 }), "tenant"), ["respond"]);
  const step = nextStepFor(deal("PROPOSED", { deadline: -1 }), "tenant", true);
  assert.equal(step.title, "Đã quá hạn kháng nghị");
  assert.match(missingActionNote(deal("PROPOSED", { deadline: -1 }), "tenant", T0) ?? "", /vẫn có thể đồng ý/);
});

test("Còn hạn: câu việc cần làm giữ nguyên", () => {
  assert.equal(nextStepFor(deal("PROPOSED", { deadline: 5 }), "tenant", false).title, "Trả lời đề xuất của chủ trọ");
  assert.equal(nextStepFor(deal("CHECKED_OUT", { deadline: 5 }), "landlord", false).title, "Đề xuất mức trừ");
  assert.equal(missingActionNote(deal("PROPOSED", { deadline: 5 }), "tenant", T0), null);
});

test("Đúng deadline vẫn được thực hiện; sau một giây thì ẩn hành động có hạn", () => {
  const cases = [
    ["RESERVED", "tenant", false, "checkin"],
    ["RESERVED", "landlord", true, "contestCheckIn"],
    ["MISMATCH_REPORTED", "landlord", false, "contestMismatch"],
    ["ABANDON_REPORTED", "tenant", false, "contestAbandon"],
    ["CHECKED_OUT", "landlord", false, "propose"],
  ] as const;
  for (const [state, role, checkin, action] of cases) {
    const d = deal(state, { deadline: 0, checkin });
    assert.ok(actionsFor(d, role, T0, null).some((a) => a.id === action), `${state}: đúng hạn`);
    assert.ok(!actionsFor(d, role, T0 + 1_000, null).some((a) => a.id === action), `${state}: quá hạn`);
  }
});

test("Người ngoài không có quyền của hai bên; hợp đồng kết thúc chỉ còn biên nhận", () => {
  for (const state of ["OPEN", "RESERVED", "ACTIVE", "CHECKED_OUT", "PROPOSED", "DISPUTED", "MISMATCH_REPORTED", "ABANDON_REPORTED"] as const) {
    assert.deepEqual(actionsFor(deal(state), "viewer", T0, null), []);
  }
  for (const role of ["tenant", "landlord"] as const) {
    assert.deepEqual(ids(deal("SETTLED"), role), ["receipt"]);
    assert.deepEqual(ids(deal("REFUNDED"), role), ["receipt"]);
    assert.deepEqual(ids(deal("CANCELLED"), role), []);
  }
});
