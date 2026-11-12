"use client";
// "Nhận tiền test": POST /api/v1/faucet (API của Khải). Server gửi AVAX + mUSDC cho ví trong token.
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Droplets } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiClientError, type FaucetResponse } from "@/lib/client/api";
import { formatToken } from "@/lib/client/money";
import { explorerTxUrl } from "@/lib/chain";

export function FaucetButton() {
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(false);

  async function claim() {
    setLoading(true);
    const id = toast.loading("Đang gửi tiền test vào ví…");
    try {
      const token = await getAccessToken();
      const res = await apiFetch<FaucetResponse>("/faucet", { method: "POST", token });
      toast.success(`Đã nhận ${res.avax} AVAX và ${formatToken(res.token)}`, {
        id,
        action: { label: "Snowtrace", onClick: () => window.open(explorerTxUrl + res.tokenTxHash, "_blank") },
      });
    } catch (e) {
      const err = e instanceof ApiClientError ? e : null;
      const msg =
        err?.code === "RATE_LIMITED"
          ? "Ví này đã nhận tiền test hôm nay. Mỗi ví nhận 1 lần mỗi 24 giờ."
          : err?.status === 404
            ? "Faucet chưa sẵn sàng. Thử lại sau nhé."
            : err?.code === "UNAUTHORIZED"
              ? "Phiên đăng nhập hết hạn. Đăng nhập lại rồi thử."
              : (err?.message ?? "Không nhận được tiền test.");
      toast.error(msg, { id });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" size="lg" className="w-full" disabled={loading} onClick={claim}>
      <Droplets /> {loading ? "Đang gửi…" : "Nhận tiền test"}
    </Button>
  );
}
