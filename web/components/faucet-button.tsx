"use client";
// "Nhận tiền test": POST /api/v1/faucet (API của Khải). Server gửi AVAX + mUSDC cho ví trong token.
// Kết quả nằm lại ngay dưới nút (không chỉ toast): số nhận được và cả hai hash để kiểm chứng; lỗi nói rõ có thử lại được không.
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Check, Droplets, ExternalLink, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiClientError, type FaucetResponse } from "@/lib/client/api";
import { formatToken } from "@/lib/client/money";
import { faucetError, type FaucetError } from "@/lib/client/tx-view";
import { explorerTxUrl } from "@/lib/chain";

export type FaucetPhase =
  | { name: "idle" }
  | { name: "loading" }
  | { name: "done"; result: FaucetResponse }
  | { name: "error"; error: FaucetError };

export function FaucetButton() {
  const { getAccessToken } = usePrivy();
  const [phase, setPhase] = useState<FaucetPhase>({ name: "idle" });

  async function claim() {
    setPhase({ name: "loading" });
    try {
      const token = await getAccessToken();
      if (!token) {
        setPhase({ name: "error", error: faucetError({ status: 401, code: "UNAUTHORIZED" }) });
        return;
      }
      const result = await apiFetch<FaucetResponse>("/faucet", { method: "POST", token });
      setPhase({ name: "done", result });
    } catch (e) {
      setPhase({ name: "error", error: faucetError(e instanceof ApiClientError ? e : null) });
    }
  }

  return <FaucetView phase={phase} onClaim={claim} />;
}

/** Phần vẽ, tách khỏi Privy/API để xem thử với dữ liệu giả (/dev/tx-status). */
export function FaucetView({ phase, onClaim }: { phase: FaucetPhase; onClaim: () => void }) {
  const loading = phase.name === "loading";
  const done = phase.name === "done";
  // Đã nhận trong 24 giờ không phải lỗi: người dùng đã có tiền. Hiện như ghi chú xám, không khung đỏ.
  const rated = phase.name === "error" && phase.error.kind === "rate";
  const retryLabel = phase.name === "error" && phase.error.retryable ? "Thử nhận lại" : "Nhận thêm tiền thử";

  return (
    <div className="min-w-0 space-y-3">
      <Button variant="secondary" size="lg" className="w-full" disabled={loading || done || rated} onClick={onClaim} aria-busy={loading}>
        {loading ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : done || rated ? <Check aria-hidden="true" /> : <Droplets aria-hidden="true" />}
        {loading ? "Đang nhận tiền thử…" : done ? "Đã nhận tiền thử" : rated ? "Hôm nay bạn đã nhận rồi" : retryLabel}
      </Button>
      {rated && <p role="status" className="text-sm text-muted-foreground">Mỗi ví nhận 1 lần mỗi 24 giờ. Số dư ở trên đã gồm lần nhận trước.</p>}

      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Đang gửi tiền thử và một ít phí mạng vào tài khoản của bạn. Thường mất vài giây; đừng bấm lại.
        </p>
      )}

      {phase.name === "done" && (
        <div role="status" className="space-y-1 rounded-xl bg-success/10 p-3 text-sm text-success">
          <p className="font-semibold">
            Đã nhận {phase.result.avax} AVAX và {formatToken(phase.result.token)}
          </p>
          <p className="text-foreground/80">AVAX dùng để trả phí giao dịch. Số dư trong app có thể cần vài giây để cập nhật.</p>
          <div className="flex flex-wrap gap-x-4">
            <TxLink hash={phase.result.tokenTxHash} label="Xem lần gửi mUSDC" />
            <TxLink hash={phase.result.avaxTxHash} label="Xem lần gửi AVAX" />
          </div>
        </div>
      )}

      {phase.name === "error" && !rated && (
        <div role="alert" className="flex items-start gap-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 space-y-0.5">
            <p className="font-semibold break-words">Chưa nhận được tiền thử</p>
            <p className="break-words text-foreground/80">{phase.error.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function TxLink({ hash, label }: { hash: string; label: string }) {
  return (
    <a
      href={explorerTxUrl + hash}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary underline underline-offset-2"
    >
      {label} <ExternalLink className="size-3.5" aria-hidden="true" />
      <span className="sr-only">(mở tab mới)</span>
    </a>
  );
}
