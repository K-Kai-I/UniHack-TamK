// Mảnh giao diện nhỏ dùng chung cho các màn của một hợp đồng (báo cáo AI, trả lời, biên nhận).
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

/** Một dòng "nhãn ..... giá trị" trong khung <dl>. */
export function Row({
  label,
  value,
  sub,
  strong,
  tone,
}: {
  label: React.ReactNode;
  value: string;
  sub?: string;
  strong?: boolean;
  tone?: "success" | "destructive";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">
        <span
          className={cn(
            strong ? "text-xl font-extrabold" : "font-semibold",
            strong && !tone && "text-primary",
            tone === "success" && "text-success",
            tone === "destructive" && "text-destructive",
          )}
        >
          {value}
        </span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </dd>
    </div>
  );
}

export function Rows({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("divide-y rounded-2xl bg-card ring-1 ring-foreground/10", className)}>{children}</dl>;
}

export function InfoBox({
  icon,
  title,
  children,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  tone?: "neutral" | "warning" | "danger" | "success";
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl p-4 text-sm",
        tone === "neutral" && "bg-secondary/60",
        tone === "warning" && "bg-warning/10 ring-1 ring-warning/30",
        tone === "danger" && "bg-destructive/5 ring-1 ring-destructive/20",
        tone === "success" && "bg-success/10 ring-1 ring-success/30",
      )}
    >
      <span
        className={cn(
          "mt-0.5",
          tone === "danger" ? "text-destructive" : tone === "success" ? "text-success" : "text-primary",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="font-semibold text-primary">{title}</p>
        {children && <div className="text-foreground/80">{children}</div>}
      </div>
    </div>
  );
}

/** Màn bị chặn (sai bước, không tìm thấy, lỗi mạng) kèm nút quay lại hợp đồng. */
export function Blocked({
  back,
  header,
  title,
  text,
  children,
}: {
  back: string;
  header?: string;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-5">
      <PageHeader href={back} backLabel="Về hợp đồng" title={header} />
      <div className="mt-8 grid place-items-center gap-3 rounded-2xl bg-muted px-6 py-12 text-center">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
        {children ?? (
          <Button asChild variant="outline">
            <Link href={back}>Về hợp đồng</Link>
          </Button>
        )}
      </div>
    </main>
  );
}

/** Thanh nút cố định ở đáy màn (tay cái với tới được). */
export function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto max-w-md space-y-2 px-5 pt-3">{children}</div>
    </div>
  );
}
