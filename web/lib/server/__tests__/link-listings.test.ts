// Test ghép tin đăng mồ côi với hợp đồng trên chuỗi. Chạy: npm run be:test
import assert from "node:assert/strict";
import { test } from "node:test";
import { matchOrphans } from "../link-listings";

const A = "0x9f661111d3dc0becac7156b40367d236cd075fb1";
const B = "0x1111111111111111111111111111111111111111";
const H1 = "0x" + "aa".repeat(32);
const H2 = "0x" + "bb".repeat(32);

test("khớp termsHash và chủ trọ (không phân biệt hoa thường) thì gắn", () => {
  const out = matchOrphans(
    [{ id: "L1", landlord: A, terms_hash: H1 }],
    [
      {
        id: 1n,
        landlord: A.toUpperCase().replace("0X", "0x"),
        termsHash: H1.toUpperCase().replace("0X", "0x"),
      },
    ],
    new Set(),
  );
  assert.deepEqual(out, [{ listingId: "L1", dealId: 1n }]);
});

test("cùng termsHash nhưng khác chủ trọ thì KHÔNG gắn (không nhận vơ phòng người khác)", () => {
  assert.deepEqual(
    matchOrphans(
      [{ id: "L1", landlord: B, terms_hash: H1 }],
      [{ id: 1n, landlord: A, termsHash: H1 }],
      new Set(),
    ),
    [],
  );
});

test("cùng chủ trọ nhưng khác termsHash thì KHÔNG gắn", () => {
  assert.deepEqual(
    matchOrphans(
      [{ id: "L1", landlord: A, terms_hash: H2 }],
      [{ id: 1n, landlord: A, termsHash: H1 }],
      new Set(),
    ),
    [],
  );
});

test("hợp đồng đã có tin đăng thì bỏ qua", () => {
  assert.deepEqual(
    matchOrphans(
      [{ id: "L2", landlord: A, terms_hash: H1 }],
      [{ id: 1n, landlord: A, termsHash: H1 }],
      new Set(["1"]),
    ),
    [],
  );
});

test("hai tin trùng điều khoản, hai hợp đồng: mỗi hợp đồng một tin, tin cũ gắn với hợp đồng cũ", () => {
  const out = matchOrphans(
    [
      { id: "old", landlord: A, terms_hash: H1 },
      { id: "new", landlord: A, terms_hash: H1 },
    ],
    [
      { id: 5n, landlord: A, termsHash: H1 },
      { id: 3n, landlord: A, termsHash: H1 },
    ],
    new Set(),
  );
  assert.deepEqual(out, [
    { listingId: "old", dealId: 3n },
    { listingId: "new", dealId: 5n },
  ]);
});
