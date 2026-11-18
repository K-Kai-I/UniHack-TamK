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
    <header className="flex min-w-0 items-start gap-2 pt-3 pb-2">
      <Link
        href={href}
        aria-label={backLabel}
        className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full text-primary transition-colors hover:bg-secondary"
      >
        <ArrowLeft className="size-5" aria-hidden="true" />
      </Link>
      {title && <p className="min-w-0 flex-1 py-2.5 font-semibold break-words text-primary">{title}</p>}
      {right && <div className="ml-auto min-w-0 max-w-[40%] shrink-0 py-2.5 break-words">{right}</div>}
    </header>
  );
}
