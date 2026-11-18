// Hồi quy: cột jsonb phải lưu OBJECT, không phải chuỗi JSON bọc thêm một lớp (lỗi "Không tải được thông tin phòng").
// Chỉ có ý nghĩa với Postgres thật (postgres.js), nên cần DATABASE_URL trỏ tới một database THỬ NGHIỆM, không phải production.
// Chạy: DATABASE_URL=postgres://... npm run be:test
import assert from "node:assert/strict";
import { test } from "node:test";
import { db } from "../db";
import { getListing, insertListing, insertPhotoSet } from "../repo";
import type { Terms } from "../../types";

const skip = process.env.DATABASE_URL ? false : "cần DATABASE_URL (Postgres thật)";

test("terms ghi bằng insertListing đọc lại là object", { skip }, async () => {
  const terms = { schema: "kct.terms/1", room: { title: "Phòng thử" }, listingPhotos: [], positions: [] } as unknown as Terms;
  const id = await insertListing("0x" + "1".repeat(40) as `0x${string}`, terms, ("0x" + "a".repeat(64)) as `0x${string}`);
  const row = await getListing(id);
  assert.equal(typeof row?.terms, "object");
  assert.deepEqual(row?.terms, terms);
  const [{ ty }] = await (await db()).query<{ ty: string }>("SELECT jsonb_typeof(terms) AS ty FROM listings WHERE id = $1", [id]);
  assert.equal(ty, "object");
});

test("photo_sets.photo_ids đọc lại là object", { skip }, async () => {
  const id = await insertPhotoSet(1n, "checkin", { x: 1 } as never, ("0x" + "b".repeat(64)) as `0x${string}`, { p1: "ph_1" }, ("0x" + "1".repeat(40)) as `0x${string}`);
  const [r] = await (await db()).query<{ a: string; b: string }>("SELECT jsonb_typeof(photo_ids) a, jsonb_typeof(manifest) b FROM photo_sets WHERE id = $1", [id]);
  assert.deepEqual(r, { a: "object", b: "object" });
});
