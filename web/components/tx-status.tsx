"use client";
// Trạng thái giao dịch (AGENTS.md): chờ ký → chờ xác nhận → xong (kèm link Snowtrace) hoặc lỗi (kèm lý do).
// Chữ do lib/client/tx-view.ts quyết định; ở đây chỉ vẽ. Hash luôn còn trên màn ở mọi pha có hash, kể cả khi lỗi,
// để người dùng tự kiểm chứng trước khi ký lại.
import { useEffect, useState } from "react";
import { Check, CheckCircle2, Copy, ExternalLink, Loader2, XCircle } from "lucide-react";
import { explorerTxUrl } from "@/lib/chain";
import { shortAddress } from "@/lib/client/money";
import { describeTx, SLOW_PENDING_SECONDS, type TxTone } from "@/lib/client/tx-view";
import type { TxState } from "@/lib/client/use-tx";
import type { Hash } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE: Record<TxTone, { box: string; Icon: typeof Loader2 }> = {
  info: { box: "bg-info/10 text-info", Icon: Loader2 },
  success: { box: "bg-success/10 text-success", Icon: CheckCircle2 },
  error: { box: "bg-destructive/10 text-destructive", Icon: XCircle },
};

/** Đếm giây từ lúc vào pha pending của hash này; một bộ hẹn giờ, không hỏi chuỗi. */
function useSlowPending(state: TxState): boolean {
  const [slow, setSlow] = useState(false);
  const watching = state.phase === "pending" ? state.hash : undefined;
  useEffect(() => {
    setSlow(false);
    if (!watching) return;
    const id = window.setTimeout(() => setSlow(true), SLOW_PENDING_SECONDS * 1000);
    return () => window.clearTimeout(id);
  }, [watching]);
  return slow;
}

export function HashActions({ hash }: { hash: Hash }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(null), 2500);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied("yes");
    } catch {
      setCopied("no"); // trình duyệt chặn clipboard: hash vẫn đọc được ở dòng trên
    }
  }

  return (
    <div className="space-y-1 pt-1 text-foreground">
      <p className="text-xs text-muted-foreground">
        Mã giao dịch <span className="font-mono break-all text-foreground">{shortAddress(hash, 10, 8)}</span>
      </p>
      <div className="flex flex-wrap gap-x-4">
        <a
          href={explorerTxUrl + hash}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-2"
        >
          Xem trên Snowtrace <ExternalLink className="size-3.5" aria-hidden="true" />
          <span className="sr-only">(mở tab mới)</span>
        </a>
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-2"
        >
          {copied === "yes" ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          {copied === "yes" ? "Đã sao chép" : copied === "no" ? "Không sao chép được" : "Sao chép mã"}
        </button>
      </div>
    </div>
  );
}

export function TxStatus({ state, doneText = "Giao dịch thành công" }: { state: TxState; doneText?: string }) {
  const slow = useSlowPending(state);
  const view = describeTx(state, doneText);
  if (!view) return null;
  const { box, Icon } = TONE[view.tone];
  const isError = view.tone === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      data-tx-phase={state.phase}
      className={cn("flex min-w-0 items-start gap-3 rounded-xl p-3 text-sm", box)}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", view.busy && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        {view.step && <p className="text-xs font-semibold">{view.step}</p>}
        <p className="font-semibold break-words">{view.title}</p>
        {view.note && <p className="break-words text-foreground/80">{view.note}</p>}
        {view.next && <p className="break-words text-foreground/80">{view.next}</p>}
        {slow && (
          <p className="break-words text-foreground/80">
            Chuỗi đang chậm hơn thường lệ. Giao dịch vẫn đang được xử lý, đừng gửi lại; mở Snowtrace để xem tiến độ.
          </p>
        )}
        {state.hash && <HashActions hash={state.hash} />}
      </div>
    </div>
  );
}
