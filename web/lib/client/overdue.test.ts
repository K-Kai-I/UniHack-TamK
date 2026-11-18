// Test hành vi cho logic quá hạn (task UI 18). Chạy: node --import tsx --test lib/client/overdue.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { missingActionNote, overdueStage, stepOutcome } from "./overdue";
import type { DealView } from "./deals-data";
import type { DealState } from "../types";

const T0 = Date.parse("2026-11-17T10:00:00Z");
const iso = (offsetMin: number) => new Date(T0 + offsetMin * 60_000).toISOString();

function deal(state: DealState, o: { deadline?: number | null; checkin?: boolean; contested?: boolean } = {}): DealView {
  return {
    dealId: 1,
    onchain: {
      state,
      deadline: o.deadline === undefined || o.deadline === null ? null : iso(o.deadline),
      checkInContested: o.contested ?? false,
    },
    photoSets: { checkin: o.checkin ? { items: [] } : null, checkout: null },
  } as unknown as DealView;
}

test("overdueStage: còn hạn / quá hạn chờ contract / bấm được / không có hạn", () => {
  assert.equal(overdueStage("PROPOSED", iso(10), T0, false), "counting");
  assert.equal(overdueStage("PROPOSED", iso(-1), T0, false), "waiting");
  assert.equal(overdueStage("PROPOSED", iso(-1), T0, true), "ready");
  assert.equal(overdueStage("ACTIVE", null, T0, false), "none");
});

test("overdueStage: hạn đúng lúc bằng now tính là đã quá hạn (khớp useCountdown)", () => {
  assert.equal(overdueStage("PROPOSED", iso(0), T0, false), "waiting");
});

test("overdueStage: hợp đồng đã kết thúc không còn hạn, kể cả khi canPoke còn true do dữ liệu cũ", () => {
  for (const s of ["SETTLED", "REFUNDED", "CANCELLED"] as const) assert.equal(overdueStage(s, iso(-5), T0, true), "none");
});

test("stepOutcome: phân biệt đã chia tiền / đóng tin / sang bước mới / chưa thấy đổi", () => {
  assert.deepEqual(stepOutcome("PROPOSED", deal("SETTLED")), { kind: "paid" });
  assert.deepEqual(stepOutcome("RESERVED", deal("REFUNDED")), { kind: "paid" });
  assert.deepEqual(stepOutcome("OPEN", deal("CANCELLED")), { kind: "closed" });
  assert.deepEqual(stepOutcome("RESERVED", deal("ACTIVE")), { kind: "moved", state: "ACTIVE" });
  assert.deepEqual(stepOutcome("PROPOSED", deal("PROPOSED")), { kind: "same" });
});

test("stepOutcome: chưa tải được deal mới thì KHÔNG khẳng định tiền đã chia", () => {
  assert.deepEqual(stepOutcome("PROPOSED", undefined), { kind: "same" });
});

test("missingActionNote: chủ trọ đã phản đối ảnh một lần hoặc hết hạn phản đối", () => {
  assert.match(missingActionNote(deal("RESERVED", { checkin: true, contested: true, deadline: 30 }), "landlord", T0) ?? "", /một lần/);
  assert.match(missingActionNote(deal("RESERVED", { checkin: true, deadline: -1 }), "landlord", T0) ?? "", /hết thời gian phản đối/);
});

test("missingActionNote: còn nút thì không có ghi chú; chưa có ảnh thì không có gì để phản đối", () => {
  assert.equal(missingActionNote(deal("RESERVED", { checkin: true, deadline: 30 }), "landlord", T0), null);
  assert.equal(missingActionNote(deal("RESERVED", { checkin: false, deadline: -1 }), "landlord", T0), null);
});

test("missingActionNote: người thuê hết hạn xác nhận còn ở; chủ trọ hết hạn phản đối phòng sai", () => {
  assert.match(missingActionNote(deal("ABANDON_REPORTED", { deadline: -1 }), "tenant", T0) ?? "", /Tôi vẫn đang ở/);
  assert.equal(missingActionNote(deal("ABANDON_REPORTED", { deadline: 5 }), "tenant", T0), null);
  assert.match(missingActionNote(deal("MISMATCH_REPORTED", { deadline: -1 }), "landlord", T0) ?? "", /hoàn đủ cọc/);
});

test("missingActionNote: người xem không có ghi chú nào", () => {
  assert.equal(missingActionNote(deal("ABANDON_REPORTED", { deadline: -1 }), "viewer", T0), null);
});
