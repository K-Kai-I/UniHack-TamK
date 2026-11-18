"use client";
// Trang mẫu nội bộ. Dữ liệu và thao tác bên dưới không gửi giao dịch.
import Link from "next/link";
import { useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { PageHeader } from "@/components/page-header";
import { PageShell, PageColumns } from "@/components/page-shell";
import { BottomBar, InfoBox, Row, Rows } from "@/components/deal-bits";
import { DEAL_STATES } from "@/lib/types";

const SWATCHES = [
  ["primary", "bg-primary"], ["secondary", "bg-secondary"],
  ["accent", "bg-accent"], ["muted", "bg-muted"],
  ["success", "bg-success"], ["warning", "bg-warning"],
  ["info", "bg-info"], ["destructive", "bg-destructive"],
] as const;

export default function DevUiPage() {
  const [size, setSize] = useState<"wide" | "read" | "form">("wide");
  const [showError, setShowError] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <PageShell size={size}>
      <PageHeader href="/home" backLabel="Về trang chủ" title="Bộ giao diện dùng chung" />
      <header className="my-6 space-y-3">
        <h1 className="text-2xl font-bold text-primary">Căn phòng qua từng mốc</h1>
        <p className="max-w-prose text-muted-foreground">Mẫu nội bộ của hướng A. Số tiền và trạng thái bên dưới là dữ liệu giả; các nút mẫu không ký hay gửi giao dịch.</p>
        <nav aria-label="Đi tới màn sản phẩm" className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/rooms">Phòng đang trống</Link></Button>
          <Button asChild variant="outline"><Link href="/deals">Hợp đồng của tôi</Link></Button>
        </nav>
        <div className="max-w-sm space-y-2">
          <Label htmlFor="shell-size">Khung trang để kiểm tra</Label>
          <select id="shell-size" value={size} onChange={(event) => setSize(event.target.value as typeof size)} className="min-h-12 w-full rounded-lg border border-input bg-background px-3 text-base">
            <option value="wide">Rộng · tối đa 1200px</option>
            <option value="read">Đọc · tối đa 768px</option>
            <option value="form">Form · tối đa 640px</option>
          </select>
        </div>
      </header>

      <PageColumns style={size === "wide" ? undefined : { gridTemplateColumns: "minmax(0, 1fr)" }}>
        <div className="space-y-8">
          <section className="space-y-3" aria-labelledby="colors">
            <h2 id="colors" className="text-lg font-bold">Màu và trạng thái</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SWATCHES.map(([name, cls]) => (
                <div key={name} className="space-y-1">
                  <div className={`${cls} h-12 rounded-lg border`} />
                  <p className="text-xs font-semibold">{name}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {DEAL_STATES.map((state) => <DealStatusBadge key={state} state={state} />)}
              <Badge variant="secondary">Nhãn dài được xuống dòng khi không đủ chỗ</Badge>
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="type">
            <h2 id="type" className="text-lg font-bold">Chữ tiếng Việt</h2>
            <p className="text-2xl leading-snug font-bold text-primary">Két Cọc Trọ — Ảnh nhận phòng</p>
            <p>Đặng Thị Mỹ Duyên — Nguyễn Hữu Phước — Kháng nghị</p>
            <p className="tabular-nums">6.000.000 ₫ · 17/11/2026</p>
            <p className="max-w-prose text-sm text-muted-foreground">Tên phòng dài tự xuống dòng: Phòng trọ có cửa sổ, gác lửng tại đường Nguyễn Hữu Thọ, quận Hải Châu, Đà Nẵng.</p>
            <p className="font-mono text-sm break-all">0x12ab34cd56ef7890a1b2c3d4e5f6a7b8c9d0ef12</p>
          </section>

          <section className="space-y-3" aria-labelledby="buttons">
            <h2 id="buttons" className="text-lg font-bold">Nút và phản hồi</h2>
            <div className="flex flex-wrap gap-3">
              <Button size="lg"><Camera aria-hidden="true" /> Chụp ảnh nhận phòng</Button>
              <Button variant="secondary">Xem ảnh gốc</Button>
              <Button variant="outline">Xem hợp đồng</Button>
              <Button variant="destructive">Kháng nghị</Button>
              <Button disabled><Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> Đang xác nhận…</Button>
            </div>
            <InfoBox icon={<Camera className="size-5" />} title="Chưa có ảnh nhận phòng">Mẫu trạng thái trống; ảnh bằng chứng sẽ hiển thị theo từng vị trí chụp.</InfoBox>
          </section>

          <section className="space-y-3" aria-labelledby="form">
            <h2 id="form" className="text-lg font-bold">Form, lỗi và bản nháp</h2>
            <p className="text-sm text-muted-foreground">Nhập nội dung rồi đổi khung trang hoặc kích thước cửa sổ để kiểm tra bản nháp.</p>
            <div className="space-y-2">
              <Label htmlFor="room-title">Tên phòng mẫu</Label>
              <Input id="room-title" placeholder="Phòng có cửa sổ ở Hải Châu" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deposit">Tiền cọc mẫu (VND)</Label>
              <Input id="deposit" inputMode="numeric" placeholder="6.000.000" aria-invalid={showError} aria-describedby={showError ? "deposit-error" : undefined} />
              {showError && <p id="deposit-error" className="text-sm text-destructive">Đây là lỗi mẫu nhiều dòng. Kiểm tra lại số tiền và thử lại; nội dung bạn đã nhập vẫn được giữ để sửa.</p>}
            </div>
            <Skeleton className="h-20 w-full" />
            <p className="text-sm text-muted-foreground">Khối trên là mẫu đang tải có chủ ý.</p>
          </section>
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Tóm tắt và hành động mẫu">
          <h2 className="text-lg font-bold">Tiền cọc mẫu</h2>
          <Rows>
            <Row label="Tiền cọc" value="6.000.000 ₫" strong />
            <Row label="Phí giữ chỗ (nằm trong cọc)" value="500.000 ₫" />
            <Row label="Mức trừ đề xuất" value="400.000 ₫" />
            <Row label="Dự kiến nhận lại" value="5.600.000 ₫" strong />
          </Rows>
          <p className="text-sm text-muted-foreground">Vùng nút nằm dưới trên điện thoại và trở về cột này trên desktop.</p>
          <BottomBar>
            {showError && <p role="alert" className="text-sm text-destructive">Lỗi mẫu: chưa gửi được. Kiểm tra số tiền ở trên, giữ nguyên bản nháp và thử lại khi đã sửa.</p>}
            {saved && <p role="status" className="text-sm text-success">Đã bấm nút mẫu. Không có giao dịch nào được gửi.</p>}
            <Button size="lg" className="w-full" onClick={() => setSaved(true)}>Thử hành động mẫu</Button>
            <Button variant="outline" className="w-full" onClick={() => setShowError(!showError)}>{showError ? "Ẩn lỗi mẫu" : "Hiện lỗi nhiều dòng"}</Button>
          </BottomBar>
        </aside>
      </PageColumns>
    </PageShell>
  );
}
