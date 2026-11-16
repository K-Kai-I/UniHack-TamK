// Ba lời gọi API của luồng Đăng phòng (docs/api-contract.md > "Ba luồng gọi chính" #1):
//   POST /uploads  →  POST /listings  →  (ví ký createDeal)  →  POST /listings/:id/onchain
// API của Khải chưa xong thì chạy BẢN GIẢ. Đặt NEXT_PUBLIC_MOCK_API=0 để gọi API thật; UI không đổi.
import type { Hash } from "@/lib/types";
import { apiFetch, ApiClientError } from "./api";
import type { CreateDealArgs } from "./use-create-deal";

// TODO(spec): chưa có kiểu cho response của /uploads, /listings trong web/lib/types.ts. Khai báo tạm theo docs.
export interface UploadResponse {
  photoId: string;
  url: string;
  sha256: Hash;
  bytes: number;
}
export interface CreateListingResponse {
  listingId: string;
  termsHash: Hash;
  createDealArgs: CreateDealArgs;
}

const USE_MOCK = process.env.NEXT_PUBLIC_MOCK_API !== "0";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface UploadInput {
  blob: Blob;
  // checkin/checkout: ảnh nhận và trả phòng; mismatch: ảnh thực tế khi báo phòng sai (lib/client/photo-sets-api.ts).
  // positionKey = positionId (p1, p2…).
  purpose: "listing" | "example" | "checkin" | "checkout" | "mismatch";
  capturedAt: string;
  positionKey?: string;
}

export async function uploadPhoto(input: UploadInput, token: string | null): Promise<UploadResponse> {
  if (USE_MOCK) {
    await delay(300);
    return {
      photoId: `ph_mock_${Math.random().toString(36).slice(2, 10)}`,
      url: URL.createObjectURL(input.blob),
      sha256: `0x${"0".repeat(64)}`,
      bytes: input.blob.size,
    };
  }
  // Server giới hạn 5 MB/ảnh; báo sớm thay vì chờ 413.
  if (input.blob.size > 5 * 1024 * 1024) {
    throw new ApiClientError(413, "FILE_TOO_LARGE", "Ảnh quá lớn (tối đa 5 MB). Chụp lại ở độ phân giải thấp hơn.");
  }
  const form = new FormData();
  form.set("file", input.blob, "photo.jpg");
  form.set("purpose", input.purpose);
  form.set("capturedAt", input.capturedAt);
  if (input.positionKey) form.set("positionId", input.positionKey);
  let res: Response;
  try {
    res = await fetch("/api/v1/uploads", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
  } catch {
    throw new ApiClientError(0, "NETWORK", "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiClientError(res.status, data?.error?.code ?? "UNKNOWN", data?.error?.message ?? `Lỗi ${res.status}`);
  }
  return data as UploadResponse;
}

export async function createListing(body: unknown, token: string | null): Promise<CreateListingResponse> {
  if (USE_MOCK) {
    await delay(500);
    const b = body as {
      money: { depositAmount: string; reserveFeeAmount: string };
      dates: { moveInDate: string; leaseEnd: string };
      yieldEnabled: boolean;
    };
    return {
      listingId: `ls_mock_${Date.now()}`,
      // Hash GIẢ: hash thật chỉ do API tính (AGENTS.md luật 5).
      termsHash: `0x${"0".repeat(60)}dead`,
      createDealArgs: {
        deposit: b.money.depositAmount,
        reserveFee: b.money.reserveFeeAmount,
        moveInDate: Math.floor(new Date(b.dates.moveInDate).getTime() / 1000),
        leaseEnd: Math.floor(new Date(b.dates.leaseEnd).getTime() / 1000),
        yieldEnabled: b.yieldEnabled,
        termsHash: `0x${"0".repeat(60)}dead`,
      },
    };
  }
  return apiFetch<CreateListingResponse>("/listings", { method: "POST", body, token });
}

export async function confirmOnchain(
  listingId: string,
  body: { dealId: number; txHash: Hash },
  token: string | null,
): Promise<void> {
  if (USE_MOCK) {
    await delay(200);
    return;
  }
  await apiFetch(`/listings/${listingId}/onchain`, { method: "POST", body, token });
}
