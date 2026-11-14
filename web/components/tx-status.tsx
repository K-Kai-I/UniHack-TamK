"use client";
// 3 trạng thái giao dịch (AGENTS.md): đang chờ ký/xác nhận, xong (kèm link Snowtrace), lỗi (kèm lý do).
import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { explorerTxUrl } from "@/lib/chain";
import type { TxState } from "@/lib/client/use-tx";
import { shortAddress } from "@/lib/client/money";
import { cn } from "@/lib/utils";

export function TxStatus({ state, doneText = "Giao dịch thành công" }: { state: TxState; doneText?: string }) {
  if (state.phase === "idle") return null;

  const link = state.hash && (
    <a
      href={explorerTxUrl + state.hash}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs underline underline-offset-2"
    >
      {shortAddress(state.hash, 10, 6)} <ExternalLink className="size-3" />
    </a>
  );

  const view = {
    signing: { Icon: Loader2, spin: true, tone: "bg-info/10 text-info", title: "Chờ bạn ký…", note: state.sponsored ? "Phí gas do app trả." : "Xác nhận trong ví." },
    pending: { Icon: Loader2, spin: true, tone: "bg-info/10 text-info", title: "Đang chờ chuỗi xác nhận…", note: "Thường mất vài giây." },
    success: { Icon: CheckCircle2, spin: false, tone: "bg-success/10 text-success", title: doneText, note: state.sponsored ? "Phí gas do app trả." : "" },
    error: { Icon: XCircle, spin: false, tone: "bg-destructive/10 text-destructive", title: "Không thành công", note: state.error ?? "" },
  }[state.phase];

  return (
    <div role="status" aria-live="polite" className={cn("flex items-start gap-3 rounded-xl p-3 text-sm", view.tone)}>
      <view.Icon className={cn("mt-0.5 size-5 shrink-0", view.spin && "animate-spin")} />
      <div className="space-y-0.5">
        <p className="font-semibold">{view.title}</p>
        {view.note && <p className="text-foreground/80">{view.note}</p>}
        {link}
      </div>
    </div>
  );
}
