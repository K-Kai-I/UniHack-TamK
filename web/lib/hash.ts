// Quy tắc hash: docs/data-contract.md > Quy tắc hash.
// CHỈ API (server) dùng file này. Frontend và module AI không tự tính hash.
import canonicalize from "canonicalize";
import { keccak256, sha256, toBytes } from "viem";
import type { Hash } from "./types";

/** Hash file JSON: chuẩn hóa RFC 8785 (JCS) rồi keccak256. */
export function hashJson(value: unknown): Hash {
  const text = canonicalize(value);
  if (text === undefined) throw new Error("hashJson: giá trị không chuẩn hóa được");
  return keccak256(toBytes(text));
}

/** Hash file ảnh: sha256 của đúng các byte đã lưu. */
export function hashImage(bytes: Uint8Array): Hash {
  return sha256(bytes);
}
