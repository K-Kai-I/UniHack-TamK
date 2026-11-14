// Hiển thị tiền cho người dùng. CHỈ để hiển thị: không bao giờ gửi kết quả ở đây lên chuỗi.
// Số tiền trên chuỗi luôn là Amount (chuỗi số nguyên, 6 số lẻ) → bigint (AGENTS.md luật 8).
import type { Amount } from "@/lib/types";
import { TOKEN_DECIMALS } from "@/lib/chain";

const UNIT = 10n ** BigInt(TOKEN_DECIMALS);

/** Amount → số VND (bigint), làm tròn xuống. vndPerToken lấy từ GET /config. */
export function amountToVnd(amount: Amount | bigint, vndPerToken: number): bigint {
  const a = typeof amount === "bigint" ? amount : BigInt(amount);
  return (a * BigInt(Math.round(vndPerToken))) / UNIT;
}

/** "1.500.000 ₫" */
export function formatVnd(vnd: bigint | number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(vnd);
}

/** Amount → "60 mUSDC" (tối đa 2 số lẻ khi hiển thị). */
export function formatToken(amount: Amount | bigint, symbol = "mUSDC"): string {
  const a = typeof amount === "bigint" ? amount : BigInt(amount);
  const whole = a / UNIT;
  const cents = ((a % UNIT) * 100n) / UNIT;
  const frac = cents === 0n ? "" : "," + cents.toString().padStart(2, "0").replace(/0$/, "");
  return `${new Intl.NumberFormat("vi-VN").format(whole)}${frac} ${symbol}`;
}

/** 0x12ab…cdef */
export function shortAddress(addr: string, head = 6, tail = 4): string {
  return addr.length <= head + tail ? addr : `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** Chuỗi người dùng gõ ("3.000.000", "3 000 000") → số nguyên VND; rỗng hoặc có chữ lạ → null. */
export function parseVndInput(text: string): bigint | null {
  const digits = text.replace(/[\s.,]/g, "");
  return /^\d+$/.test(digits) ? BigInt(digits) : null;
}

/**
 * VND → Amount (chuỗi, 6 số lẻ), làm tròn xuống. Chủ trọ nhập VND, chuỗi lưu mUSDC theo vndPerToken.
 * Dùng bigint hoàn toàn (AGENTS.md luật 8), không qua number.
 */
export function vndToAmount(vnd: bigint, vndPerToken: number): string {
  return ((vnd * UNIT) / BigInt(Math.round(vndPerToken))).toString();
}
