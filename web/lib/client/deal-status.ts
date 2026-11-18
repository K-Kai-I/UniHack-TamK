// Nhãn tiếng Việt + màu cho từng trạng thái deal (enum State trong docs/contract-spec.md).
// Trạng thái luôn ĐỌC từ contract; file này chỉ quyết định cách hiển thị.
import type { DealState } from "@/lib/types";

export type StatusTone = "info" | "primary" | "warning" | "danger" | "success" | "muted";

export const DEAL_STATUS: Record<DealState, { label: string; tone: StatusTone }> = {
  OPEN: { label: "Đang trống", tone: "info" },
  RESERVED: { label: "Đã cọc", tone: "primary" },
  ACTIVE: { label: "Đang ở", tone: "primary" },
  CHECKED_OUT: { label: "Đã trả phòng", tone: "warning" },
  PROPOSED: { label: "Chờ người thuê", tone: "warning" },
  DISPUTED: { label: "Đang phân xử", tone: "danger" },
  SETTLED: { label: "Đã chia tiền", tone: "success" },
  REFUNDED: { label: "Đã hoàn cọc", tone: "success" },
  CANCELLED: { label: "Đã gỡ tin", tone: "muted" },
  MISMATCH_REPORTED: { label: "Báo sai mô tả", tone: "danger" },
  ABANDON_REPORTED: { label: "Báo bỏ ngang", tone: "danger" },
};

/** Class Tailwind cho Badge theo tone (dùng token trong app/globals.css). */
export const TONE_CLASS: Record<StatusTone, string> = {
  info: "bg-info/10 text-info border-info/20",
  primary: "bg-primary/10 text-primary border-primary/20",
  warning: "bg-warning/15 text-warning-foreground border-warning/30",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
  success: "bg-success/10 text-success border-success/25",
  muted: "bg-muted text-muted-foreground border-border",
};
