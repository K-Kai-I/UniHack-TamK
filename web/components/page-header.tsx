import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Đầu trang con: nút quay lại (vùng chạm 44px) + tiêu đề ngắn + chỗ cho thao tác bên phải. */
export function PageHeader({
  href,
  backLabel,
  title,
  right,
}: {
  href: string;
  backLabel: string;
  title?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex items-center gap-1 pt-3">
      <Link
        href={href}
        aria-label={backLabel}
        className="-ml-2 grid size-11 place-items-center rounded-full text-primary transition hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ArrowLeft className="size-5" />
      </Link>
      {title && <p className="flex-1 truncate font-semibold text-primary">{title}</p>}
      {right}
    </header>
  );
}
