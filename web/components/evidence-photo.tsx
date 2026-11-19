"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
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
        <div className="overflow-hidden rounded-xl border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={attempt} src={url} alt={alt} loading="lazy" onError={() => setFailed(true)}
            className="block h-auto max-h-[28rem] w-full object-contain" />
        </div>
      ) : (
        <div className="aspect-[4/3] overflow-hidden rounded-xl border bg-muted">
          {empty ? (
            <div className="grid size-full place-items-center p-3 text-center text-sm text-muted-foreground">{empty}</div>
          ) : (
            <RoomCover url={null} alt={alt} label={failed ? "Không tải được ảnh" : undefined} />
          )}
        </div>
      )}
      {url && !empty && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {failed && (
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
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline underline-offset-4"
          >
            Xem ảnh gốc<span className="sr-only">: {alt} (mở thẻ mới)</span>
            <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
          </a>
        </div>
      )}
    </figure>
  );
}
