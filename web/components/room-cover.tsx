"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Dùng đúng ảnh nguồn; thiếu ảnh và lỗi tải có nhãn riêng, không thay bằng ảnh phòng giả. */
export function RoomCover(props: {
  url: string | null;
  alt: string;
  className?: string;
  label?: string;
  fit?: "cover" | "contain";
  onError?: () => void;
}) {
  // URL đổi thì thử ảnh mới; giữ lỗi cục bộ, không làm remount thẻ/link đang có focus.
  return <CoverImage key={props.url} {...props} />;
}

function CoverImage({ url, alt, className, label, fit = "cover", onError }: Parameters<typeof RoomCover>[0]) {
  const [failed, setFailed] = useState(false);

  if (url && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} loading="lazy" onError={() => { setFailed(true); onError?.(); }} className={cn("size-full", fit === "contain" ? "object-contain" : "object-cover", className)} />;
  }

  const message = failed ? "Không tải được ảnh" : (label ?? "Chưa có ảnh");
  // Thumbnail 64/80px chỉ hiện icon; container rộng hơn mới đủ chỗ cho nhãn.
  // Accessible name luôn giữ đủ thông báo, kể cả khi nhãn không hiện.
  return (
    <div
      role="img"
      aria-label={`${message || "Chưa có ảnh"}: ${alt}`}
      className={cn("@container grid size-full place-items-center bg-muted p-2 text-muted-foreground", className)}
    >
      <div className="flex min-w-0 flex-col items-center gap-1 text-center @[8rem]:gap-2">
        <ImageOff className="size-6 shrink-0 @[8rem]:size-8" strokeWidth={1.5} aria-hidden="true" />
        {message && <span className="hidden text-sm break-words @[8rem]:block">{message}</span>}
      </div>
    </div>
  );
}
