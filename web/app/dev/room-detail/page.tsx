"use client";

import { useState } from "react";
import { RoomDetailView, RoomDepositActionView } from "@/components/room-detail";
import { WALL_SAMPLE_TERMS, type DealDetail } from "@/lib/client/rooms-data";

// Chỉ kiểm tra tỉ lệ/đủ bốn mép ảnh; đây không phải ảnh phòng thực tế.
function image(width: number, height: number) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ebe6f4"/><rect x="4" y="4" width="${width - 8}" height="${height - 8}" fill="none" stroke="#30254b" stroke-width="8"/><path d="M0 0L${width} ${height}M${width} 0L0 ${height}" stroke="#898092"/><text x="50%" y="50%" text-anchor="middle" font-size="24" fill="#30254b">${width} × ${height} · TEST</text></svg>`)}`;
}

const sample: DealDetail = {
  dealId: 12,
  terms: WALL_SAMPLE_TERMS,
  onchain: { state: "OPEN", landlord: WALL_SAMPLE_TERMS.landlord, tenant: null, deposit: "240000000", reserveFee: "20000000" },
  listingPhotoUrls: [image(800, 400), image(400, 800), image(600, 600), "/preview-missing-room.jpg"],
  examplePhotoUrls: { p1: image(400, 800), p2: image(800, 400), p3: null },
};
const options = {
  ready: "Người thuê · ảnh ngang/dọc/vuông/lỗi", public: "Chưa đăng nhập", owner: "Chủ trọ", auth: "Đang chuẩn bị đăng nhập", wallet: "Đang chuẩn bị ví",
  empty: "Không có ảnh/tiện nghi", loading: "Đang tải", error: "Lỗi tải lần đầu", retrying: "Đang thử lại", stale: "Lỗi cập nhật · giữ dữ liệu cũ", refreshing: "Đang cập nhật", missing: "Không tìm thấy", reserved: "Đã có người cọc", cancelled: "Đã gỡ phòng", expired: "Hết hạn · trạng thái vẫn OPEN", config: "Chưa tải được cấu hình", long: "Nội dung và số tiền dài",
};

export default function RoomDetailPreview() {
  const [state, setState] = useState("ready");
  const [notice, setNotice] = useState("");
  const [imageVersion, setImageVersion] = useState(0);
  let deal = sample;
  if (state === "empty") deal = { ...sample, terms: { ...sample.terms, listingPhotos: [], room: { ...sample.terms.room, amenities: [] } }, listingPhotoUrls: [], examplePhotoUrls: {} };
  if (state === "reserved" || state === "cancelled") deal = { ...sample, onchain: { ...sample.onchain, state: state === "reserved" ? "RESERVED" : "CANCELLED" } };
  if (state === "long") deal = { ...sample, onchain: { ...sample.onchain, deposit: "999999999999999999999999", reserveFee: "99999999999999999999999" }, terms: { ...sample.terms, room: { ...sample.terms.room, title: "Đặng Thị Mỹ Duyên — Phòng có gác và ban công trên đường Nguyễn Hữu Phước ".repeat(3), address: "ĐịaChỉRấtDài/".repeat(24), amenities: ["TiệnNghiRấtDài".repeat(15)] }, positions: sample.terms.positions.map(p => ({ ...p, name: p.name.repeat(8), instruction: "HướngDẫnChụpRấtDài/".repeat(15) })), priceList: sample.terms.priceList.map(p => ({ ...p, item: "HạngMụcDài".repeat(20), priceAmount: "999999999999999999999999" })) } };
  const noData = ["loading", "error", "retrying"].includes(state);
  const error = ["error", "retrying", "stale"].includes(state);
  const fetching = ["loading", "retrying", "refreshing"].includes(state);
  const expired = state === "expired";
  const unavailable = error || fetching || state === "config" || expired;
  const viewer = state === "public" ? "signed-out" : state === "owner" ? "owner" : state === "auth" ? "loading" : state === "wallet" ? "wallet-pending" : "tenant";
  return <>
    <div className="flex flex-wrap items-center gap-3 border-b bg-muted p-4">
      <label htmlFor="preview-state" className="text-sm font-semibold">Mẫu UI · không giao dịch</label>
      <select id="preview-state" value={state} onChange={e => { setState(e.target.value); setNotice(""); }} className="min-h-12 min-w-0 max-w-full rounded-lg border border-input bg-background px-3">
        {Object.entries(options).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <p role="status" className="text-sm">{notice}</p>
    </div>
    <RoomDetailView deal={noData ? undefined : deal} loading={state === "loading"} fetching={fetching} error={error} notFound={state === "missing"} mock
      onRetry={() => { setNotice("Đã yêu cầu tải lại (mẫu)"); setImageVersion(v => v + 1); }}
      deadline={state === "config" ? null : expired ? "2026-11-16T02:03:00Z" : "2026-11-20T02:03:00Z"} expired={expired}
      action={<RoomDepositActionView deal={deal} viewer={viewer} unavailable={unavailable} expired={expired} rate={25000} onLogin={() => setNotice("Đã yêu cầu đăng nhập (mẫu)")} onDeposit={() => setNotice("Đã mở bước xác nhận cọc (mẫu)")} />}
      imageVersion={imageVersion}
    />
  </>;
}
