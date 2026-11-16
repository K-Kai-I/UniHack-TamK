"use client";
// GET /config (docs/api-contract.md): tỉ giá hiển thị, thời hạn từng bước... Một query dùng chung cho cả app.
// API chưa chạy (contract chưa deploy → 409) thì data = undefined; nơi gọi tự chọn giá trị dự phòng.
import { useQuery } from "@tanstack/react-query";
import type { ConfigResponse } from "@/lib/types";
import { apiFetch } from "./api";
import { DEALS_MOCK } from "./deals-data";

export function useAppConfig(): ConfigResponse | undefined {
  const { data } = useQuery({
    queryKey: ["config"],
    queryFn: () => apiFetch<ConfigResponse>("/config"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data;
}

/**
 * `checkOutGrace` (giây) cho nút "Trả phòng thay". Chưa tải được config thì null (ẩn nút, tránh revert).
 * Bản giả không có API config: coi như 0 để thử giao diện.
 */
export function useCheckOutGrace(): number | null {
  const cfg = useAppConfig();
  return cfg?.timeouts.checkOutGrace ?? (DEALS_MOCK ? 0 : null);
}
