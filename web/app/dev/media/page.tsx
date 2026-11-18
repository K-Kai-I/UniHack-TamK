"use client";

import { useState } from "react";
import { EvidencePhoto } from "@/components/evidence-photo";
import { Illustration } from "@/components/illustration";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { RoomCover } from "@/components/room-cover";

// Chỉ là bảng chẩn đoán tỉ lệ; không đưa vào dữ liệu phòng hoặc bằng chứng.
function diagnostic(width: number, height: number) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f2eff8"/><rect x="6" y="6" width="${width - 12}" height="${height - 12}" fill="none" stroke="#30254b" stroke-width="12"/><path d="M0 0L${width} ${height}M${width} 0L0 ${height}" stroke="#898092" stroke-width="2"/><text x="50%" y="50%" text-anchor="middle" fill="#30254b" font-size="24">${width} × ${height} · TEST</text></svg>`)}`;
}

export default function MediaPreview() {
  const [state, setState] = useState("loaded");
  const [empty, setEmpty] = useState(false);
  const url = state === "missing" ? null : state === "broken" ? "/__media-preview-retry.svg" : diagnostic(800, 400);

  return (
    <PageShell>
      <PageHeader href="/dev/ui" backLabel="Về bộ giao diện" />
      <header className="my-6 space-y-3">
        <h1 className="text-2xl font-bold text-primary">Ảnh, minh họa và nhãn nguồn</h1>
        <p className="max-w-prose text-muted-foreground">Mẫu UI, không giao dịch. Các khung TEST chỉ kiểm tra tỉ lệ, không phải ảnh phòng hoặc bằng chứng thật.</p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="space-y-2" htmlFor="preview-state">
            <span className="block font-semibold">Ảnh lúc nhận phòng</span>
            <select id="preview-state" value={state} onChange={(event) => setState(event.target.value)} className="min-h-12 max-w-full rounded-lg border border-input bg-background px-3">
              <option value="loaded">Ảnh hợp lệ</option>
              <option value="missing">Chưa có ảnh</option>
              <option value="broken">Lỗi tải ảnh</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" checked={empty} onChange={(event) => setEmpty(event.target.checked)} className="size-5 accent-primary" />
            Mốc này chưa diễn ra
          </label>
        </div>
      </header>

      <section aria-labelledby="media-evidence" className="space-y-4">
        <h2 id="media-evidence" className="text-lg font-bold">Cùng vị trí: cửa sổ · dữ liệu mẫu</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <EvidencePhoto label="Lúc nhận phòng" url={url} alt="Ảnh mẫu nhận phòng: cửa sổ" empty={empty ? "Chưa tới bước nhận phòng" : undefined} />
          <EvidencePhoto label="Lúc trả phòng" url={diagnostic(400, 800)} alt="Ảnh mẫu trả phòng: cửa sổ" />
        </div>
        <p className="max-w-prose text-sm text-muted-foreground">Ảnh chưa đủ rõ để kết luận: AI chưa tính tiền vị trí đó; không có nghĩa là không có hư hỏng.</p>
      </section>

      <section aria-labelledby="media-thumbnail" className="mt-8 space-y-3">
        <h2 id="media-thumbnail" className="text-lg font-bold">Ảnh nhỏ trong danh sách</h2>
        <div className="flex flex-wrap gap-6">
          <div className="size-16 overflow-hidden rounded-xl border"><RoomCover url={null} alt="Phòng mẫu chưa có ảnh" /></div>
          <div className="size-20 overflow-hidden rounded-xl border"><RoomCover url="/__media-preview-missing.svg" alt="Phòng mẫu lỗi tải ảnh" /></div>
        </div>
        <p className="text-sm text-muted-foreground">Khung nhỏ hiện biểu tượng; tên truy cập giữ lý do thiếu ảnh hoặc lỗi tải.</p>
      </section>

      <section aria-labelledby="media-illustration" className="mt-8 space-y-4 border-t pt-6">
        <h2 id="media-illustration" className="text-lg font-bold">Hai minh họa dùng ở màn chào và màn trống</h2>
        <div className="flex flex-wrap gap-8">
          <Illustration kind="checkin" />
          <Illustration kind="handover" />
        </div>
      </section>
    </PageShell>
  );
}
