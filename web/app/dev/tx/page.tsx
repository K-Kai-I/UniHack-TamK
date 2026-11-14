"use client";
// Trang thử giao dịch: /dev/tx. Không phải màn của người dùng.
// Thử: đăng nhập Google, số dư, nhận mUSDC từ MockUSDC.faucet(), ký createDeal, và 3 trạng thái giao dịch.
// Để thử "Privy trả gas": đặt NEXT_PUBLIC_SPONSOR_GAS=1 trong web/.env.local, dùng ví Google MỚI (0 AVAX).
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { Coins, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TxStatus } from "@/components/tx-status";
import { WalletChip } from "@/components/wallet-chip";
import { NetworkBanner } from "@/components/network-banner";
import { FaucetButton } from "@/components/faucet-button";
import { addresses, chain, usdcAbi } from "@/lib/chain";
import { formatToken } from "@/lib/client/money";
import { useTx } from "@/lib/client/use-tx";
import { useCreateDeal, type CreateDealArgs } from "@/lib/client/use-create-deal";

// Điều khoản GIẢ để thử ký. Không phải termsHash thật (hash thật chỉ do API tính, AGENTS.md luật 5).
function demoArgs(): CreateDealArgs {
  const now = Math.floor(Date.now() / 1000);
  return {
    deposit: "60000000", // 60 mUSDC
    reserveFee: "10000000", // 10 mUSDC
    moveInDate: now + 3 * 24 * 3600,
    leaseEnd: now + 90 * 24 * 3600,
    yieldEnabled: false,
    termsHash: "0x000000000000000000000000000000000000000000000000000000000000dead",
  };
}

export default function DevTxPage() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address, chainId } = useAccount();
  const avax = useBalance({ address, chainId: chain.id, query: { enabled: !!address, refetchInterval: 8000 } });
  const usdc = useReadContract({
    address: addresses.token,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: chain.id,
    query: { enabled: !!address, refetchInterval: 8000 },
  });

  const faucetTx = useTx();
  const deal = useCreateDeal();

  return (
    <>
      <NetworkBanner />
      <main className="mx-auto max-w-md space-y-4 px-5 py-6">
        <h1 className="text-2xl font-extrabold text-primary">Thử giao dịch</h1>

        {!ready ? (
          <p className="text-muted-foreground">Đang tải…</p>
        ) : !authenticated ? (
          <Button size="lg" className="h-14 w-full text-base" onClick={login}>
            Đăng nhập bằng Google
          </Button>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Ví</CardTitle>
                <CardDescription>
                  Mạng: {chainId === chain.id ? "Avalanche Fuji" : `chain ${chainId ?? "?"} (sai mạng)`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <WalletChip address={address} />
                <p className="text-sm">
                  AVAX: <b className="font-mono">{avax.data ? Number(formatEther(avax.data.value)).toFixed(4) : "…"}</b>
                </p>
                <p className="text-sm">
                  mUSDC: <b>{typeof usdc.data === "bigint" ? formatToken(usdc.data) : "…"}</b>
                </p>
                <Button variant="ghost" size="sm" onClick={logout}>
                  Đăng xuất
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>1. Nhận tiền test</CardTitle>
                <CardDescription>
                  Cách A theo spec: API gửi cả AVAX và mUSDC (API của Khải, chưa có thì báo 404).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <FaucetButton />
                <p className="text-xs text-muted-foreground">
                  Cách B: ví tự gọi MockUSDC.faucet() (1.000 mUSDC). Cần gas, nên đây cũng là phép thử trả gas hộ.
                </p>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  disabled={faucetTx.state.phase === "signing" || faucetTx.state.phase === "pending"}
                  onClick={() => faucetTx.run({ address: addresses.token, abi: usdcAbi, functionName: "faucet" })}
                >
                  <Coins /> Gọi MockUSDC.faucet()
                </Button>
                <TxStatus state={faucetTx.state} doneText="Đã nhận mUSDC" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>2. Ký createDeal</CardTitle>
                <CardDescription>
                  Cọc 60 mUSDC, giữ chỗ 10, dọn vào sau 3 ngày. termsHash giả, chỉ để thử ký.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  size="lg"
                  className="w-full"
                  disabled={deal.state.phase === "signing" || deal.state.phase === "pending"}
                  onClick={() => deal.createDeal(demoArgs())}
                >
                  <FilePlus2 /> Đăng phòng thử
                </Button>
                <TxStatus state={deal.state} doneText={deal.dealId !== null ? `Đã tạo phòng #${deal.dealId}` : "Đã tạo phòng"} />
                <p className="text-xs text-muted-foreground">
                  Trả gas hộ: {deal.sponsorEnabled ? "BẬT (chỉ với ví Google của Privy)" : "tắt (người dùng tự trả AVAX test)"}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </>
  );
}
