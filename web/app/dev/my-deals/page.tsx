"use client";

import { useEffect, useState } from "react";
import { MyDealsView } from "@/components/my-deals";
import type { MyDealItem } from "@/lib/client/my-deals-api";

// Mẫu trình bày, không giả xác thực trên /deals và không gửi giao dịch.
export default function MyDealsPreview() {
  const [state, setState] = useState("many");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState<number | null>(null);
  // Chỉ tạo hạn mẫu sau hydration để HTML server và lần render client đầu giống nhau.
  useEffect(() => { setNow(Date.now()); }, []);
  if (now === null) return <MyDealsView status="loading" items={[]} onLogin={() => {}} onRetry={() => {}} mock />;
  const due = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  const item = (dealId: number, role: MyDealItem["role"], status: MyDealItem["state"], minutes: number | null): MyDealItem => ({
    dealId, listingId: `preview-${dealId}`, role, state: status, deadline: minutes === null ? null : due(minutes),
    title: `Phòng ${dealId} · Nguyễn Hữu Phước`, address: "12 Nguyễn Văn Bảo, Gò Vấp, TP. Hồ Chí Minh",
    depositAmount: "240000000", coverUrl: null,
  });
  const many = [
    item(101, "tenant", "RESERVED", 30),
    item(102, "landlord", "CHECKED_OUT", 90),
    item(103, "tenant", "PROPOSED", 45),
    item(104, "landlord", "RESERVED", 20),
    item(105, "tenant", "ACTIVE", null),
    item(106, "tenant", "SETTLED", null),
    item(107, "landlord", "REFUNDED", null),
    item(108, "landlord", "CANCELLED", null),
  ];
  let items = many;
  if (["empty", "error", "login", "loading", "wallet-pending"].includes(state)) items = [];
  if (state === "one") items = [many[0]];
  if (state === "ended") items = many.slice(5);
  if (state === "long") items = [{ ...many[2], title: "Đặng Thị Mỹ Duyên — Phòng có gác, cửa sổ và ban công nhìn ra đường Nguyễn Hữu Phước ".repeat(3), address: "Địa chỉ rất dài/".repeat(20), depositAmount: "999999999999999999999999", coverUrl: "/preview-missing-room.jpg" }];
  if (state === "deadlines") items = [item(111, "tenant", "PROPOSED", -5), item(112, "landlord", "CHECKED_OUT", -2), item(113, "tenant", "ABANDON_REPORTED", 60), item(114, "landlord", "MISMATCH_REPORTED", 90)];
  if (state === "all-states") items = [
    item(120, "landlord", "OPEN", 60), ...many,
    item(121, "tenant", "DISPUTED", 60), item(122, "landlord", "DISPUTED", 60),
    item(123, "tenant", "MISMATCH_REPORTED", 60), item(124, "landlord", "MISMATCH_REPORTED", 60),
    item(125, "tenant", "ABANDON_REPORTED", 60), item(126, "landlord", "ABANDON_REPORTED", 60),
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted p-4">
        <label htmlFor="preview-state" className="text-sm font-semibold">Mẫu UI · không giao dịch</label>
        <select id="preview-state" value={state} onChange={(e) => { setState(e.target.value); setNotice(""); }} className="min-h-12 min-w-0 max-w-full rounded-lg border border-input bg-background px-3">
          <option value="many">Nhiều hợp đồng · cả hai vai</option>
          <option value="one">Một hợp đồng · đã cọc</option>
          <option value="empty">Chưa có hợp đồng</option>
          <option value="ended">Chỉ có hợp đồng kết thúc</option>
          <option value="loading">Đang tải</option>
          <option value="wallet-pending">Đang kết nối ví</option>
          <option value="login">Chưa đăng nhập</option>
          <option value="error">Lỗi lần tải đầu</option>
          <option value="stale">Lỗi cập nhật · giữ danh sách cũ</option>
          <option value="refreshing">Đang cập nhật</option>
          <option value="long">Nội dung dài · ảnh lỗi</option>
          <option value="deadlines">Hạn phản hồi và quá hạn</option>
          <option value="all-states">Tất cả trạng thái</option>
        </select>
        <p role="status" className="text-sm">{notice}</p>
      </div>
      <MyDealsView
        status={state === "loading" || state === "wallet-pending" || state === "login" ? state : "ready"}
        items={items}
        error={state === "error" || state === "stale"}
        refreshing={state === "refreshing"}
        onLogin={() => setNotice("Mẫu: mở đăng nhập Privy.")}
        onRetry={() => setNotice("Mẫu: đã yêu cầu tải lại danh sách.")}
        mock
      />
    </>
  );
}
