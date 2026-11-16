"use client";
// Tỉ giá hiển thị VND/mUSDC từ GET /config. API chưa chạy (contract chưa deploy → 409) thì dùng tạm hằng số.
import { MOCK_VND_PER_TOKEN } from "./rooms-data";
import { useAppConfig } from "./use-config";

export function useVndRate(): number {
  return useAppConfig()?.vndPerToken ?? MOCK_VND_PER_TOKEN;
}
