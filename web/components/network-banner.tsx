"use client";
// Edge case GĐ0: ví đang ở mạng khác Fuji → banner + nút chuyển mạng.
// Ví Privy tạo sẵn đã ở Fuji; banner chủ yếu cho ví ngoài (MetaMask, Core).
import { useAccount, useSwitchChain } from "wagmi";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { chain } from "@/lib/chain";

export function NetworkBanner() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || chainId === chain.id) return null;

  return (
    <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-warning/40 bg-warning/15 px-4 py-3 text-sm text-warning-foreground">
      <TriangleAlert className="size-5 shrink-0" />
      <p className="flex-1">
        Ví đang ở sai mạng. App chỉ chạy trên <b>Avalanche Fuji</b>.
      </p>
      <Button
        size="sm"
        disabled={isPending}
        onClick={() =>
          switchChain(
            { chainId: chain.id },
            { onError: () => toast.error("Không chuyển được mạng. Hãy chuyển sang Fuji trong ví.") },
          )
        }
      >
        {isPending ? "Đang chuyển…" : "Chuyển sang Fuji"}
      </Button>
    </div>
  );
}
