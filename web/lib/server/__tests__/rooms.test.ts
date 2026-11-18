// Test danh mục phòng và yêu cầu thuê (phần không cần database). Chạy: npm run be:test
import assert from "node:assert/strict";
import { test } from "node:test";
import { hashJson } from "../../hash";
import { addMonths } from "../../client/rooms-api";
import { fold } from "../rooms-view";
import { createDealArgsOf, termsWithDates, type RoomTemplate } from "../terms-builder";

const template: RoomTemplate = {
  schema: "kct.terms/1",
  landlord: "0x1111111111111111111111111111111111111111",
  room: { title: "Phòng Quận 10", address: "Lý Thường Kiệt", rentVnd: 3000000, amenities: [] },
  listingPhotos: [],
  money: { token: "0x0000000000000000000000000000000000000001", decimals: 6, depositAmount: "240000000", reserveFeeAmount: "20000000", vndPerToken: 25000 },
  positions: [],
  priceList: [],
  yieldEnabled: false,
};

test("tìm không dấu: 'quan 10', 'Đà Lạt' khớp 'da lat'", () => {
  assert.ok(fold("Phòng Quận 10").includes("quan 10"));
  assert.equal(fold("Đà Lạt"), "da lat");
});

test("ghép ngày người thuê chọn vào điều khoản; createDealArgs dùng đúng ngày đó (giây Unix)", () => {
  const moveIn = new Date("2026-12-01T02:00:00Z");
  const leaseEnd = new Date("2027-06-01T02:00:00Z");
  const terms = termsWithDates(template, moveIn, leaseEnd);
  assert.deepEqual(terms.dates, { moveInDate: "2026-12-01T02:00:00.000Z", leaseEnd: "2027-06-01T02:00:00.000Z" });
  const a = createDealArgsOf(terms, hashJson(terms));
  assert.equal(a.moveInDate, moveIn.getTime() / 1000);
  assert.equal(a.leaseEnd, leaseEnd.getTime() / 1000);
  assert.equal(a.deposit, "240000000");
  assert.equal(a.termsHash, hashJson(terms));
});

test("ngày hết hạn không sau ngày dọn vào thì từ chối", () => {
  assert.throws(() => termsWithDates(template, new Date("2026-12-01"), new Date("2026-12-01")), /phải sau ngày dọn vào/);
});

test("cộng tháng: giữ ngày, tràn thì lùi về cuối tháng", () => {
  assert.equal(addMonths("2026-12-01", 6), "2027-06-01");
  assert.equal(addMonths("2027-01-31", 1), "2027-02-28");
  assert.equal(addMonths("2026-11-30", 12), "2027-11-30");
});
