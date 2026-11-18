"use client";
// Preview nội bộ cho task 19: trạng thái giao dịch, banner sai mạng và nút faucet, dữ liệu giả; không ví, không chuỗi, không API.
// /dev/tx-status?kind=tx&case=signing|signing-sponsored|pending|pending-slow|success|success-sponsored|error-unsent|error-unknown|error-reverted|error-reverted-sponsored
// /dev/tx-status?kind=network&case=idle|switching|error|unknown
// /dev/tx-status?kind=faucet&case=idle|loading|done|rate|auth|missing|network|server
// Mọi nút chỉ ghi vào bảng nhật ký (#dev-log). "pending-slow" đợi 30 giây thật rồi mới hiện câu chuỗi chậm.
import { useEffect, useState } from "react";
import { FaucetView, type FaucetPhase } from "@/components/faucet-button";
import { NetworkBannerView } from "@/components/network-banner";
import { PageShell } from "@/components/page-shell";
import { TxStatus } from "@/components/tx-status";
import { faucetError } from "@/lib/client/tx-view";
import type { TxState } from "@/lib/client/use-tx";
import type { Hash } from "@/lib/types";

const HASH = `0x${"ab12".repeat(16)}` as Hash;

const TX: Record<string, TxState> = {
  signing: { phase: "signing" },
  "signing-sponsored": { phase: "signing", sponsored: true },
  pending: { phase: "pending", hash: HASH },
  "pending-slow": { phase: "pending", hash: HASH },
  success: { phase: "success", hash: HASH },
  "success-sponsored": { phase: "success", hash: HASH, sponsored: true },
  "error-unsent": { phase: "error", error: "Bạn đã hủy ký giao dịch." },
  "error-unknown": { phase: "error", hash: HASH, error: "Mất kết nối mạng. Kiểm tra mạng rồi thử lại." },
  "error-reverted": { phase: "error", hash: HASH, reverted: true, error: "Giao dịch bị chuỗi từ chối (reverted)." },
  "error-reverted-sponsored": { phase: "error", hash: HASH, reverted: true, sponsored: true, error: "Giao dịch bị chuỗi từ chối (reverted)." },
};

const FAUCET_RESULT = { avaxTxHash: HASH, tokenTxHash: `0x${"cd34".repeat(16)}` as Hash, avax: "0.05", token: "1000000000" };

function faucetPhase(c: string): FaucetPhase {
  switch (c) {
    case "loading":
      return { name: "loading" };
    case "done":
      return { name: "done", result: FAUCET_RESULT };
    case "rate":
      return { name: "error", error: faucetError({ status: 429, code: "RATE_LIMITED" }) };
    case "auth":
      return { name: "error", error: faucetError({ status: 401, code: "UNAUTHORIZED" }) };
    case "missing":
      return { name: "error", error: faucetError({ status: 404, code: "UNKNOWN" }) };
    case "network":
      return { name: "error", error: faucetError({ status: 0, code: "NETWORK" }) };
    case "server":
      return { name: "error", error: faucetError({ status: 502, code: "UNKNOWN" }) };
    default:
      return { name: "idle" };
  }
}

export default function TxStatusPreview() {
  const [q, setQ] = useState<URLSearchParams | null>(null);
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => setQ(new URLSearchParams(window.location.search)), []);
  if (!q) return null;
  const kind = q.get("kind") ?? "tx";
  const c = q.get("case") ?? "idle";
  const note = (s: string) => setLog((l) => [...l, s]);

  return (
    <>
      {kind === "network" && (
        <NetworkBannerView
          currentLabel={c === "unknown" ? null : "chain 1"}
          switching={c === "switching"}
          error={c === "error" ? "Ví không tự chuyển được mạng. Mở ví, chọn Avalanche Fuji (chain ID 43113) rồi quay lại." : null}
          onSwitch={() => note("switch")}
        />
      )}
      <PageShell size="read">
        <h1 className="py-4 text-xl font-extrabold">
          {kind}: {kind === "tx" && !(c in TX) ? "signing" : c}
        </h1>
        {kind === "tx" && <TxStatus state={TX[c] ?? TX.signing} doneText="Đã gửi đề xuất" />}
        {kind === "faucet" && <FaucetView phase={faucetPhase(c)} onClaim={() => note("claim")} />}
        {kind === "network" && <p className="text-sm text-muted-foreground">Nội dung trang ở dưới banner; banner dính mép trên.</p>}
        <ul id="dev-log" hidden>
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </PageShell>
    </>
  );
}
