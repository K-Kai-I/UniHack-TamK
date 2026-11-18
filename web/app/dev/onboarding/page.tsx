"use client";

import { useState } from "react";
import Link from "next/link";
import { OnboardingView } from "@/components/onboarding";
import { WalletChip } from "@/components/wallet-chip";
import { Button } from "@/components/ui/button";
import type { UiRole } from "@/lib/client/role";

// Mẫu trình bày độc lập: không đăng nhập, gọi faucet hay gửi giao dịch.
export default function OnboardingPreview() {
  const [state, setState] = useState("public");
  const [role, setRole] = useState<UiRole | null>(null);
  const [notice, setNotice] = useState("");
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted p-4">
        <label htmlFor="preview-state" className="text-sm font-semibold">Mẫu UI · không giao dịch</label>
        <select id="preview-state" value={state} onChange={(e) => { setState(e.target.value); setNotice(""); }} className="min-h-12 min-w-0 max-w-full rounded-lg border border-input bg-background px-3">
          <option value="public">Chưa đăng nhập</option>
          <option value="loading">Đang tải</option>
          <option value="authenticated">Đã đăng nhập</option>
          <option value="wallet-pending">Đang tạo ví</option>
          <option value="juror">Bồi thẩm</option>
          <option value="long-email">Email dài</option>
        </select>
        <p role="status" className="text-sm [overflow-wrap:anywhere]">{notice}</p>
      </div>
      <OnboardingView
        ready={state !== "loading"}
        authenticated={state !== "public" && state !== "loading"}
        email={state === "long-email" ? `${"nguyen.thi.my.duyen.".repeat(8)}@example.test` : "duyen@example.test"}
        role={role}
        onRoleChange={setRole}
        onLogin={() => setNotice("Mẫu: mở đăng nhập Google hoặc ví qua Privy.")}
        onLogout={() => { setState("public"); setNotice("Mẫu: đã đăng xuất."); }}
        wallet={<WalletChip address={state === "wallet-pending" ? undefined : "0x0000000000000000000000000000000000000001"} />}
        faucet={<Button variant="secondary" size="lg" className="w-full" onClick={() => setNotice("Mẫu lỗi: không nhận được tiền thử. Hãy thử lại.")}>Nhận tiền test</Button>}
        jurorEntry={state === "juror" ? <Link href="/jury" className="block rounded-xl border border-input p-4 font-semibold text-primary">Bạn là bồi thẩm · 3 vụ mẫu đang chờ phiếu</Link> : null}
      />
    </>
  );
}
