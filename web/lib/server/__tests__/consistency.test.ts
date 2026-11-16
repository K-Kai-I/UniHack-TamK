// Test khớp chéo backend ↔ contract ↔ dữ liệu mẫu. Chạy: npm run be:test
// Mục đích: nếu ai đổi kiểu con dấu, quy tắc hash, thứ tự trạng thái hay ABI ở một nơi mà quên nơi kia,
// test này báo ngay, thay vì lỗi BadSignature / CHAIN_MISMATCH xuất hiện lúc demo.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { hashTypedData, keccak256, recoverTypedDataAddress, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hashImage, hashJson } from "../../hash";
import { sealDomain, sealTypes } from "../../seal";
import { DEAL_STATES, DISPUTE_KINDS, LISTING_VERDICT_CODE } from "../../types";

const root = join(process.cwd(), "..");
const sol = readFileSync(join(root, "contracts/src/DepositEscrow.sol"), "utf8");
const isol = readFileSync(join(root, "contracts/src/IDepositEscrow.sol"), "utf8");
const abi = JSON.parse(readFileSync(join(root, "shared/abi/DepositEscrow.json"), "utf8")) as {
  type: string;
  name?: string;
}[];
const sample = (f: string) => JSON.parse(readFileSync(join(root, "shared/samples", f), "utf8"));

/** Chuỗi kiểu EIP-712 dựng từ sealTypes, vd "DamageReport(uint256 dealId,...)". */
const typeString = (name: keyof typeof sealTypes) =>
  `${name}(${sealTypes[name].map((f) => `${f.type} ${f.name}`).join(",")})`;

test("kiểu con dấu trong web/lib/seal.ts khớp typehash trong contract", () => {
  for (const name of ["DamageReport", "MismatchReport"] as const) {
    assert.ok(sol.includes(`"${typeString(name)}"`), `contract không có chuỗi ${typeString(name)}`);
  }
});

test("tên và phiên bản domain khớp constructor EIP712 của contract", () => {
  const d = sealDomain(43113, "0x0000000000000000000000000000000000000001");
  assert.ok(sol.includes(`EIP712("${d.name}", "${d.version}")`));
});

test("thứ tự trạng thái, loại tranh chấp trong types.ts khớp enum Solidity", () => {
  const enumOf = (n: string) =>
    isol
      .match(new RegExp(`enum ${n} \\{([^}]*)\\}`))![1]
      .replace(/\/\/[^\n]*/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  assert.deepEqual([...DEAL_STATES], enumOf("State"));
  assert.deepEqual([...DISPUTE_KINDS], enumOf("DisputeKind"));
});

test("mã kết luận phòng sai mô tả khớp contract: 0 giống, 1 không rõ, 2 khác rõ", () => {
  assert.deepEqual(LISTING_VERDICT_CODE, { MATCH: 0, UNCLEAR: 1, MISMATCH: 2 });
});

test("ABI đã xuất có đủ hàm backend và frontend gọi", () => {
  const names = new Set(abi.filter((x) => x.type === "function").map((x) => x.name));
  for (const fn of [
    "createDeal", "cancelDeal", "deposit", "depositWithPermit", "submitCheckIn", "contestCheckIn",
    "submitCheckOut", "proposeDeduction", "acceptProposal", "disputeProposal", "vote", "poke", "canPoke",
    "reportMismatch", "contestMismatch", "reportAbandon", "contestAbandon", "getDeal", "dealCount",
    "isJuror", "hasVoted", "domainSeparator",
  ]) {
    assert.ok(names.has(fn), `ABI thiếu hàm ${fn}: chạy npm run export-abi trong contracts/`);
  }
});

test("hashJson không phụ thuộc thứ tự khóa và khoảng trắng (RFC 8785)", () => {
  const a = { b: 1, a: [1, 2, { z: "é", y: null }], c: "x" };
  const b = JSON.parse(' { "c":"x", "a":[1,2,{"y":null,"z":"é"}], "b":1 } ');
  assert.equal(hashJson(a), hashJson(b));
  assert.equal(hashJson({ a: 1 }), keccak256(toBytes('{"a":1}')));
  assert.notEqual(hashJson({ a: 1 }), hashJson({ a: 2 }));
});

test("đổi 1 byte ảnh thì hash ảnh đổi", () => {
  const img = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
  const img2 = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 4]);
  assert.match(hashImage(img), /^0x[0-9a-f]{64}$/);
  assert.notEqual(hashImage(img), hashImage(img2));
});

test("file mẫu trong shared/samples đúng schema và hash được", () => {
  assert.equal(sample("terms.json").schema, "kct.terms/1");
  assert.equal(sample("photoset.checkin.json").schema, "kct.photoset/1");
  assert.equal(sample("report.damage.json").schema, "kct.report.damage/1");
  assert.equal(sample("report.mismatch.json").schema, "kct.report.mismatch/1");
  for (const f of ["terms.json", "photoset.checkin.json", "report.damage.json", "report.mismatch.json"]) {
    assert.match(hashJson(sample(f)), /^0x[0-9a-f]{64}$/);
  }
});

test("con dấu ký bằng ví AI khôi phục đúng địa chỉ; sửa số tiền thì ra địa chỉ khác", async () => {
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const domain = sealDomain(43113, "0x6d2cd54af5c80acd4f1dbd634998d690d63a3657");
  const message = {
    dealId: BigInt(7),
    checkInHash: `0x${"aa".repeat(32)}`,
    checkOutHash: `0x${"bb".repeat(32)}`,
    aiAmount: BigInt(16_000_000),
    reportHash: `0x${"cc".repeat(32)}`,
  } as const;
  const signature = await account.signTypedData({ domain, types: sealTypes, primaryType: "DamageReport", message });
  const ok = await recoverTypedDataAddress({ domain, types: sealTypes, primaryType: "DamageReport", message, signature });
  assert.equal(ok, account.address);
  const tampered = await recoverTypedDataAddress({
    domain, types: sealTypes, primaryType: "DamageReport", signature,
    message: { ...message, aiAmount: BigInt(240_000_000) },
  });
  assert.notEqual(tampered, account.address);
  // Con dấu của mạng hoặc contract khác không dùng lại được.
  const other = hashTypedData({ domain: sealDomain(43114, domain.verifyingContract), types: sealTypes, primaryType: "DamageReport", message });
  assert.notEqual(other, hashTypedData({ domain, types: sealTypes, primaryType: "DamageReport", message }));
});
