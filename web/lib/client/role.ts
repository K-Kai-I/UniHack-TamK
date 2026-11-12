"use client";
// Vai trò chỉ là lựa chọn GIAO DIỆN (docs/user-flow.md > Chưa có trong spec #2), không lưu server.
// Quyền thật luôn theo địa chỉ ví landlord / tenant trong deal trên contract.
import { useCallback, useEffect, useState } from "react";

export type UiRole = "tenant" | "landlord";
const KEY = "kct.role";

export function useUiRole() {
  const [role, setRoleState] = useState<UiRole | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "tenant" || v === "landlord") setRoleState(v);
    } catch {
      // trình duyệt chặn localStorage (tab ẩn danh): bỏ qua, chỉ không nhớ được vai trò
    }
  }, []);

  const setRole = useCallback((r: UiRole) => {
    setRoleState(r);
    try {
      localStorage.setItem(KEY, r);
    } catch {}
  }, []);

  return { role, setRole };
}
