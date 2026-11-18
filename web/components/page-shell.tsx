import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Chọn khung theo loại màn; không kéo rộng form hoặc đoạn văn theo danh sách. */
export function PageShell({
  size = "wide",
  className,
  ...props
}: ComponentProps<"main"> & { size?: "wide" | "read" | "form" }) {
  return <main data-page-shell={size} className={cn("page-shell min-h-dvh pb-8", className)} {...props} />;
}

/** Đặt phần tóm tắt sau nội dung ngắn trên mobile, cạnh nội dung từ desktop. */
export function PageColumns({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("page-columns", className)} {...props} />;
}
