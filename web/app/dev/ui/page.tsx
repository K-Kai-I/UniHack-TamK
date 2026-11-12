"use client";
// Trang xem nhanh design system cho cả nhóm: /dev/ui. Không phải màn của người dùng.
import { toast } from "sonner";
import { ShieldCheck, Wallet, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { NumberTicker } from "@/components/ui/number-ticker";
import { BorderBeam } from "@/components/ui/border-beam";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { ConfettiButton } from "@/components/ui/confetti";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { DEAL_STATES } from "@/lib/types";
import { amountToVnd, formatToken, formatVnd, shortAddress } from "@/lib/client/money";
import { explorerTxUrl } from "@/lib/chain";

const SWATCHES = [
  ["primary", "bg-primary", "#0B2545"],
  ["success", "bg-success", "#10B981"],
  ["info", "bg-info", "#3B82F6"],
  ["warning", "bg-warning", "#F59E0B"],
  ["destructive", "bg-destructive", "#DC2626"],
  ["secondary", "bg-secondary", "#E8EEF6"],
  ["accent", "bg-accent", "#E7F8F1"],
  ["muted", "bg-muted", "#EEF2F7"],
] as const;

const SAMPLE_DEPOSIT = "60000000"; // 60 mUSDC
const VND_PER_TOKEN = 25000; // thật thì lấy từ GET /config
const FAKE_TX = "0x" + "ab".repeat(32);

export default function DevUiPage() {
  const depositVnd = amountToVnd(SAMPLE_DEPOSIT, VND_PER_TOKEN);

  function demoTx() {
    const id = toast.loading("Đang chờ ký giao dịch…");
    setTimeout(() => toast.loading("Đang xác nhận trên Avalanche…", { id }), 1200);
    setTimeout(
      () =>
        toast.success("Đã gửi cọc", {
          id,
          action: { label: "Snowtrace", onClick: () => window.open(explorerTxUrl + FAKE_TX, "_blank") },
        }),
      2600,
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-8 p-5 pb-16">
      <header className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">/dev/ui</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-primary">Két Cọc Trọ</h1>
        <p className="text-muted-foreground">Bộ màu, chữ và component dùng chung.</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Màu</h2>
        <div className="grid grid-cols-4 gap-3">
          {SWATCHES.map(([name, cls, hex]) => (
            <div key={name} className="space-y-1">
              <div className={`${cls} h-12 rounded-lg border`} />
              <p className="text-xs font-semibold">{name}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{hex}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Chữ (Be Vietnam Pro)</h2>
        <p className="text-2xl font-extrabold">Tiền cọc nằm trong két</p>
        <p className="text-lg font-semibold">Người thuê gửi cọc, chủ trọ đề xuất mức trừ</p>
        <p>Ảnh nhận phòng, trả phòng; bồi thẩm phân xử. Ữ ỹ ặ ằ ẫ ợ ự ỡ.</p>
        <p className="text-sm text-muted-foreground">Chữ phụ: hạn chót còn 2 giờ 15 phút.</p>
        <p className="font-mono text-sm">{shortAddress("0x12ab34cd56ef7890a1b2c3d4e5f6a7b8c9d0ef12")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Thẻ két (show off)</h2>
        <Card className="relative overflow-hidden bg-primary text-primary-foreground">
          <CardHeader>
            <CardDescription className="flex items-center gap-2 text-primary-foreground/70">
              <ShieldCheck className="size-4" /> Đang giữ trong két
            </CardDescription>
            <CardTitle className="text-4xl font-extrabold">
              <NumberTicker value={Number(depositVnd)} className="text-primary-foreground" /> ₫
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-sm text-primary-foreground/80">
            <span>{formatToken(SAMPLE_DEPOSIT)}</span>
            <DealStatusBadge state="ACTIVE" className="border-white/20 bg-white/10 text-white" />
          </CardContent>
          <BorderBeam size={120} duration={8} colorFrom="#10b981" colorTo="#6ee7b7" />
        </Card>
        <p className="text-sm text-muted-foreground">Định dạng tĩnh: {formatVnd(depositVnd)}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Nút</h2>
        <Button size="lg" className="w-full">
          <Wallet /> Gửi cọc
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary">Kháng nghị</Button>
          <Button variant="outline">Xem hợp đồng</Button>
          <Button variant="destructive">Báo phòng sai</Button>
          <Button disabled>Đang xử lý…</Button>
        </div>
        <ShimmerButton className="w-full" background="#0b2545" shimmerColor="#6ee7b7">
          <span className="flex items-center gap-2 font-semibold">
            <Camera className="size-4" /> Chụp ảnh nhận phòng
          </span>
        </ShimmerButton>
        <ConfettiButton
          className="w-full bg-success text-success-foreground hover:bg-success/90"
          options={{ colors: ["#10b981", "#0b2545", "#f59e0b"] }}
        >
          Đồng ý chia tiền
        </ConfettiButton>
        <Button variant="outline" className="w-full" onClick={demoTx}>
          Thử toast 3 trạng thái giao dịch
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Trạng thái deal</h2>
        <div className="flex flex-wrap gap-2">
          {DEAL_STATES.map((s) => (
            <DealStatusBadge key={s} state={s} />
          ))}
        </div>
        <div className="flex gap-2">
          <Badge>Mặc định</Badge>
          <Badge variant="secondary">Phụ</Badge>
          <Badge variant="outline">Viền</Badge>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Form + đang tải</h2>
        <div className="space-y-2">
          <Label htmlFor="deposit">Tiền cọc (VND)</Label>
          <Input id="deposit" inputMode="numeric" placeholder="1.500.000" />
        </div>
        <Skeleton className="h-20 w-full" />
      </section>
    </main>
  );
}
