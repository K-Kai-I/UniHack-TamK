// Ngày hiển thị cho người dùng. JSON luôn là ISO UTC; hiển thị theo giờ Việt Nam để server và client in ra giống nhau.
import type { IsoTime } from "@/lib/types";

const TZ = "Asia/Ho_Chi_Minh";

/** "20/11/2026" */
export function formatDate(iso: IsoTime): string {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(iso),
  );
}

/** "20/11" (Intl vi-VN ghép ngày-tháng bằng dấu gạch, nên tự ghép) */
export function formatDayMonth(iso: IsoTime): string {
  const parts = new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, day: "2-digit", month: "2-digit" }).formatToParts(
    new Date(iso),
  );
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}`;
}

/** Số tháng tròn giữa hai ngày, tối thiểu 1. */
export function monthsBetween(fromIso: IsoTime, toIso: IsoTime): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(1, Math.round(ms / (30.44 * 24 * 3600 * 1000)));
}
