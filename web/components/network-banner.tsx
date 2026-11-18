"use client";
// Ví đang ở mạng khác Fuji → banner + nút chuyển mạng. Ví Privy tạo sẵn đã ở Fuji; banner chủ yếu cho ví ngoài (MetaMask, Core).
// Chỉ chuyển mạng khi người dùng bấm nút; không tự đổi mạng, gas hay ví. Lỗi nằm lại trên banner (không chỉ toast) để còn đọc được.
import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chain } from "@/lib/chain";
import { networkView, switchChainError } from "@/lib/client/tx-view";

export function NetworkBanner() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const [error, setError] = useState<string | null>(null);
  const view = networkView(isConnected, chainId, chain.id);
  if (!view.show) return null;

  return (
    <NetworkBannerView
      currentLabel={view.currentLabel}
      switching={isPending}
      error={error}
      onSwitch={() => {
        setError(null);
        switchChain({ chainId: chain.id }, { onError: (e) => setError(switchChainError(e, chain.name, chain.id)) });
      }}
    />
  );
}

/** Phần vẽ, tách khỏi wagmi để xem thử với dữ liệu giả (/dev/tx-status). */
export function NetworkBannerView({
  currentLabel,
  switching,
  error,
  onSwitch,
}: {
  currentLabel: string | null;
  switching: boolean;
  error: string | null;
  onSwitch: () => void;
}) {
  return (
    <div
      role="alert"
      className="sticky top-0 z-40 border-b border-warning/40 bg-warning/15 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-sm text-warning-foreground sm:px-6 lg:px-8"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold break-words">Ví đang ở sai mạng{currentLabel ? ` (${currentLabel})` : ""}</p>
            <p className="break-words">
              App chỉ chạy trên <b>{chain.name}</b> (chain ID {chain.id}). Chưa chuyển mạng thì chưa ký được giao dịch nào.
            </p>
            {switching && <p className="break-words">Đang chờ ví. Nếu ví hỏi, hãy xác nhận chuyển mạng.</p>}
            {error && <p className="break-words font-semibold">{error}</p>}
          </div>
        </div>
        <Button className="w-full shrink-0 sm:w-auto" disabled={switching} onClick={onSwitch}>
          {switching && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {switching ? "Đang chuyển…" : error ? "Thử chuyển lại" : `Chuyển sang ${chain.name}`}
        </Button>
      </div>
    </div>
  );
}
