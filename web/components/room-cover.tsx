import { BedDouble } from "lucide-react";
import { cn } from "@/lib/utils";

/** Ảnh phòng. Chưa có url (dữ liệu giả hoặc ảnh chưa tải) thì vẽ khung giữ chỗ cùng tông thương hiệu. */
export function RoomCover({
  url,
  alt,
  className,
  label,
}: {
  url: string | null;
  alt: string;
  className?: string;
  label?: string;
}) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} loading="lazy" className={cn("size-full object-cover", className)} />;
  }
  return (
    <div
      role="img"
      aria-label={label ?? "Chưa có ảnh"}
      className={cn(
        "grid size-full place-items-center bg-gradient-to-br from-secondary via-secondary to-accent text-primary/40",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-1.5">
        <BedDouble className="size-8" strokeWidth={1.5} />
        {label && <span className="text-xs font-medium text-primary/60">{label}</span>}
      </div>
    </div>
  );
}
