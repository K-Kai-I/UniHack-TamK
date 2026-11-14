"use client";
// Tỉ giá hiển thị VND/mUSDC từ GET /config. API chưa chạy (contract chưa deploy → 409) thì dùng tạm hằng số.
import { useQuery } from "@tanstack/react-query";
import type { ConfigResponse } from "@/lib/types";
import { apiFetch } from "./api";
import { MOCK_VND_PER_TOKEN } from "./rooms-data";

export function useVndRate(): number {
  const { data } = useQuery({
    queryKey: ["config"],
    queryFn: () => apiFetch<ConfigResponse>("/config"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data?.vndPerToken ?? MOCK_VND_PER_TOKEN;
}
