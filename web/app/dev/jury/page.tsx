"use client";

import { useEffect, useState } from "react";
import { JuryListView } from "@/components/jury-list";
import type { JurorDisputeItem } from "@/lib/client/disputes-api";

// Mẫu trình bày, không đăng nhập, không gửi giao dịch, không bỏ phiếu.
export default function JuryListPreview() {
  const [state, setState] = useState("many");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState<number | null>(null);
  // Chỉ tạo hạn mẫu sau hydration để HTML server và lần render client đầu giống nhau.
  useEffect(() => { setNow(Date.now()); }, []);
  const noop = () => {};
  if (now === null) return <JuryListView status="loading" items={[]} isJuror={false} loaded={false} onLogin={noop} onRetry={noop} mock />;
  const due = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  const item = (dealId: number, kind: JurorDisputeItem["kind"], minutes: number, landlord = 0, tenant = 0): JurorDisputeItem => ({
    dealId, kind, deadline: due(minutes), votes: { landlord, tenant }, title: `Phòng ${dealId} · Nguyễn Hữu Phước`,
  });
  const many = [
    item(36, "MISMATCH", 60 * 30, 0, 0),
    item(26, "DEDUCTION", 60 * 5, 1, 0),
    item(35, "DEDUCTION", 90, 0, 1),
    item(41, "DEDUCTION", -20, 1, 1),
  ];
  let items = many;
  if (["empty", "stale-empty", "not-juror", "error", "login", "loading", "wallet-pending"].includes(state)) items = [];
  if (state === "one") items = [many[1]];
  if (state === "long") items = [{ ...many[1], title: "Đặng Thị Mỹ Duyên — Phòng có gác, cửa sổ và ban công nhìn ra đường Nguyễn Hữu Phước ".repeat(3), votes: { landlord: 1, tenant: 1 } }];
  if (state === "expired") items = [item(51, "DEDUCTION", -5, 1, 0), item(52, "MISMATCH", -600, 0, 1)];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted p-4">
        <label htmlFor="preview-state" className="text-sm font-semibold">Mẫu UI · không giao dịch</label>
        <select id="preview-state" value={state} onChange={(e) => { setState(e.target.value); setNotice(""); }} className="min-h-12 min-w-0 max-w-full rounded-lg border border-input bg-background px-3">
          <option value="many">Nhiều vụ · cả hai loại</option>
          <option value="one">Một vụ</option>
          <option value="empty">Là bồi thẩm · chưa có vụ</option>
          <option value="not-juror">Ví chưa là bồi thẩm</option>
          <option value="loading">Đang tải</option>
          <option value="wallet-pending">Đang kết nối ví</option>
          <option value="login">Chưa đăng nhập</option>
          <option value="error">Lỗi lần tải đầu</option>
          <option value="stale">Lỗi cập nhật · giữ danh sách cũ</option>
          <option value="stale-empty">Lỗi cập nhật · danh sách cũ rỗng</option>
          <option value="refreshing">Đang cập nhật</option>
          <option value="long">Tên phòng dài</option>
          <option value="expired">Chỉ có vụ quá hạn</option>
        </select>
        <p role="status" className="text-sm">{notice}</p>
      </div>
      <JuryListView
        status={state === "loading" || state === "wallet-pending" || state === "login" ? state : "ready"}
        items={items}
        isJuror={state !== "not-juror"}
        loaded={state !== "error"}
        address="0x1234567890abcdef1234567890abcdef12345678"
        error={state === "error" || state === "stale" || state === "stale-empty"}
        refreshing={state === "refreshing"}
        onLogin={() => setNotice("Mẫu: mở đăng nhập Privy.")}
        onRetry={() => setNotice("Mẫu: đã yêu cầu tải lại danh sách.")}
        mock
      />
    </>
  );
}
