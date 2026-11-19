"use client";
// Chuyển bộ ảnh vừa chụp giữa màn "Gửi ảnh nhận phòng" và màn "Phòng không giống mô tả" mà không bắt chụp lại.
// Giữ trong bộ nhớ của tab (biến module), không lưu xuống máy: tải lại trang là mất, đúng ý "ảnh chỉ chụp trong app".
// Chỉ giữ blob; mỗi màn nhận tự tạo object URL mới (màn gửi đi sẽ thu hồi URL cũ khi rời trang).

type Held = { dealId: number; shots: Record<string, { blob: Blob; capturedAt: string }> };
let held: Held | null = null;

export function handOffShots(dealId: number, shots: Record<string, { blob: Blob; capturedAt: string }>) {
  held = { dealId, shots: Object.fromEntries(Object.entries(shots).map(([k, s]) => [k, { blob: s.blob, capturedAt: s.capturedAt }])) };
}

/** Lấy bộ ảnh đang giữ cho hợp đồng này (một lần), kèm object URL mới để xem trước. */
export function takeShots(dealId: number): Record<string, { blob: Blob; capturedAt: string; previewUrl: string }> | null {
  if (!held || held.dealId !== dealId) return null;
  const out = Object.fromEntries(
    Object.entries(held.shots).map(([k, s]) => [k, { ...s, previewUrl: URL.createObjectURL(s.blob) }]),
  );
  held = null;
  return out;
}
