import Link from "next/link";
import { SearchX } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

// Đường dẫn không tồn tại: thay trang 404 tiếng Anh mặc định của Next bằng màn tiếng Việt cùng khung đọc.
export default function NotFound() {
  return (
    <PageShell size="read">
      <PageHeader href="/home" backLabel="Về trang chủ" />
      <section className="mt-8 grid place-items-center gap-3 rounded-2xl bg-muted px-6 py-12 text-center">
        <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-xl font-bold">Không tìm thấy trang này</h1>
        <p className="text-muted-foreground">Đường dẫn có thể bị sai hoặc trang đã được chuyển.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/home">Về trang chủ</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/deals">Hợp đồng của tôi</Link>
          </Button>
        </div>
      </section>
    </PageShell>
  );
}
