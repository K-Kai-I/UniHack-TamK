"use client";

import { useState } from "react";
import { RoomsListView } from "@/components/rooms-list";
import { RoomCover } from "@/components/room-cover";
import type { ListingItem } from "@/lib/client/rooms-data";

// Ảnh chẩn đoán tỉ lệ, chỉ dùng ở trang mẫu; không thay ảnh phòng thực tế.
function testImage(width: number, height: number) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ebe6f4"/><rect x="4" y="4" width="${width - 8}" height="${height - 8}" fill="none" stroke="#30254b" stroke-width="8"/><path d="M0 0L${width} ${height}M${width} 0L0 ${height}" stroke="#898092" stroke-width="2"/><text x="50%" y="50%" text-anchor="middle" fill="#30254b" font-size="24">${width} × ${height} · TEST</text></svg>`)}`;
}

const base: ListingItem = {
  listingId: "preview-12", dealId: 12,
  title: "Phòng 20m² gần ĐH Bách Khoa", address: "268 Lý Thường Kiệt, Quận 10, TP. Hồ Chí Minh",
  rentVnd: 3_000_000, depositAmount: "240000000", reserveFeeAmount: "20000000",
  moveInDate: "2026-11-20T02:00:00Z", coverUrl: null,
  landlord: `0x${"1".repeat(40)}`, amenities: ["Máy lạnh", "Tủ lạnh"],
};
const many: ListingItem[] = [
  base,
  { ...base, dealId: 13, listingId: "preview-13", title: "Studio đầy đủ nội thất, ban công thoáng, cách ĐH Kinh tế 5 phút đi bộ", address: "45/7 Nguyễn Đình Chiểu, Phường 6, Quận 3, TP. Hồ Chí Minh", rentVnd: 4_500_000, depositAmount: "360000000", amenities: ["Máy lạnh", "Máy giặt", "Tủ lạnh", "Bếp từ", "Ban công", "Gửi xe miễn phí"] },
  { ...base, dealId: 14, listingId: "preview-14", title: "Phòng trọ Thủ Đức", address: "12 Võ Văn Ngân, TP. Thủ Đức", rentVnd: 1_800_000, depositAmount: "72000000", amenities: [] },
  { ...base, dealId: 16, listingId: "preview-16", title: "Phòng có gác gần chợ Bến Thành", rentVnd: 6_000_000, depositAmount: "480000000", moveInDate: "2027-01-05T02:00:00Z" },
];

export default function RoomsPreview() {
  const [state, setState] = useState("many");
  const [notice, setNotice] = useState("");
  const [imageVersion, setImageVersion] = useState(0);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  let items: ListingItem[] | undefined = many;
  if (["loading", "error", "retrying"].includes(state)) items = undefined;
  if (["empty", "stale-empty"].includes(state)) items = [];
  if (state === "one") items = [base];
  if (state === "long") items = [{ ...base, title: "Đặng Thị Mỹ Duyên — Phòng có gác và ban công nhìn ra đường Nguyễn Hữu Phước ".repeat(3), address: "ĐịaChỉRấtDài/".repeat(24), depositAmount: "999999999999999999999999", amenities: ["TiệnNghiRấtDài".repeat(15)], coverUrl: "/preview-missing-room.jpg" }];
  if (state === "images") items = [
    { ...base, title: "Ảnh ngang 2:1 · kiểm tra đủ bốn góc", coverUrl: testImage(800, 400) },
    { ...many[1], title: "Ảnh dọc 1:2 · kiểm tra đủ bốn góc", coverUrl: testImage(400, 800) },
    { ...many[2], title: "Ảnh vuông · kiểm tra đủ bốn góc", coverUrl: testImage(600, 600) },
    { ...many[3], title: "Ảnh không tải được", coverUrl: "/preview-missing-room.jpg" },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted p-4">
        <label htmlFor="preview-state" className="text-sm font-semibold">Mẫu UI · không giao dịch</label>
        <select id="preview-state" value={state} onChange={(e) => { setState(e.target.value); setNotice(""); }} className="min-h-12 min-w-0 max-w-full rounded-lg border border-input bg-background px-3">
          <option value="many">Nhiều phòng · chưa có ảnh</option>
          <option value="one">Một phòng</option>
          <option value="empty">Chưa có phòng</option>
          <option value="loading">Đang tải</option>
          <option value="error">Lỗi lần tải đầu</option>
          <option value="retrying">Đang thử lại sau lỗi</option>
          <option value="stale">Lỗi cập nhật · giữ dữ liệu cũ</option>
          <option value="stale-empty">Lỗi cập nhật · danh sách cũ trống</option>
          <option value="refreshing">Đang cập nhật</option>
          <option value="long">Nội dung dài · ảnh lỗi</option>
          <option value="images">Ảnh chẩn đoán tỉ lệ · ảnh lỗi</option>
          <option value="cover">RoomCover · đổi URL và lỗi tải</option>
        </select>
        <p role="status" className="text-sm">{notice}</p>
      </div>
      {state === "cover" ? (
        <div className="mx-auto max-w-xl space-y-4 p-4">
          <h1 className="text-xl font-bold">Ảnh chẩn đoán · không phải ảnh phòng</h1>
          <div className="flex flex-wrap gap-2">
            <button className="min-h-12 rounded-lg border border-input p-3" onClick={() => setCoverUrl("/preview-missing-room.jpg")}>URL lỗi</button>
            <button className="min-h-12 rounded-lg border border-input p-3" onClick={() => setCoverUrl(testImage(800, 400))}>URL hợp lệ</button>
            <button className="min-h-12 rounded-lg border border-input p-3" onClick={() => setCoverUrl(null)}>Xóa ảnh</button>
          </div>
          <div className="aspect-[4/3] bg-muted"><RoomCover url={coverUrl} alt="Ảnh chẩn đoán" fit="contain" /></div>
          <div className="flex flex-wrap gap-4" aria-label="Kiểm tra ảnh dự phòng ở khung nhỏ">
            <div className="size-16 overflow-hidden" data-cover-test="small"><RoomCover url={null} alt="Ảnh ví dụ 64px" /></div>
            <div className="size-20 overflow-hidden" data-cover-test="small-error"><RoomCover url="/preview-missing-room.jpg" alt="Ảnh lỗi 80px" /></div>
            <div className="size-36 overflow-hidden" data-cover-test="report"><RoomCover url={null} alt="Ảnh báo cáo 144px" label="Chưa có ảnh" /></div>
            <div className="size-20 overflow-hidden" data-cover-test="camera"><RoomCover url={null} alt="Ảnh camera tham chiếu" label="" /></div>
          </div>
        </div>
      ) : (
        <RoomsListView
          items={items}
          loading={state === "loading"}
          error={["error", "retrying", "stale", "stale-empty"].includes(state)}
          refreshing={["loading", "refreshing", "retrying"].includes(state)}
          onRetry={() => { setNotice("Mẫu: đã yêu cầu tải lại danh sách và ảnh."); setImageVersion((v) => v + 1); }}
          vndRate={25000}
          imageVersion={imageVersion}
          mock
        />
      )}
    </>
  );
}
