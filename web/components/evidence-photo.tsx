"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoomCover } from "@/components/room-cover";

/**
 * Một ảnh bằng chứng của một mốc (nhận phòng, trả phòng...). Ảnh hiện đủ khung (không cắt), nhãn nằm trên ảnh,
 * có link mở ảnh gốc ở thẻ mới. Dùng cho các màn so ảnh trước/sau (báo cáo, bồi thẩm...).
 */
export function EvidencePhoto(props: {
  label: string;
  url?: string | null;
  alt: string;
  /** Có chữ = mốc này không có ảnh (và lý do). */
  empty?: string | null;
}) {
  return <EvidenceImage key={`${props.url ?? ""}:${props.empty ?? ""}`} {...props} />;
}

function EvidenceImage({
  label,
  url,
  alt,
  empty,
}: {
  label: string;
  url?: string | null;
  alt: string;
  /** Có chữ = mốc này không có ảnh (và lý do). Không truyền = có ảnh, hoặc khung "Chưa có ảnh" nếu url rỗng. */
  empty?: string | null;
}) {
  const [attempt, setAttempt] = useState(0);
  // Giữ nút sau lần thử lại để focus bàn phím không mất khi ảnh tải được.
  const [failed, setFailed] = useState(false);

  return (
    <figure className="min-w-0 space-y-2">
      <figcaption className="text-sm font-semibold">{label}</figcaption>
      {url && !empty && !failed ? (
        // Khung theo đúng tỉ lệ ảnh: ảnh đủ khung, không cắt, không có dải xám trên dưới.
        // Hai ảnh cùng camera nên cặp trước/sau tự cao bằng nhau.
        // Chạm vào ảnh là mở ảnh gốc cỡ lớn (thẻ mới), thay cho link "Xem ảnh gốc" riêng.
        <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={attempt} src={url} alt={alt} loading="lazy" onError={() => setFailed(true)}
            className="block h-auto max-h-[28rem] w-full object-contain" />
          <span className="sr-only"> (chạm để xem ảnh gốc, mở thẻ mới)</span>
        </a>
      ) : (
        <div className="aspect-[4/3] overflow-hidden rounded-xl border bg-muted">
          {empty ? (
            <div className="grid size-full place-items-center p-3 text-center text-sm text-muted-foreground">{empty}</div>
          ) : (
            <RoomCover url={null} alt={alt} label={failed ? "Không tải được ảnh" : undefined} />
          )}
        </div>
      )}
      {url && !empty && failed && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Tải lại ảnh: ${alt}`}
          onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}
        >
          <RefreshCw className="size-4" aria-hidden="true" /> Tải lại ảnh
        </Button>
      )}
    </figure>
  );
}
