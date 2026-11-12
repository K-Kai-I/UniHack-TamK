// Gọi API /api/v1 từ trình duyệt. Token Privy gửi qua header Authorization (docs/api-contract.md).
// Server tự lấy địa chỉ ví từ token, nên frontend KHÔNG gửi địa chỉ ví trong body.
import type { ApiError, ApiErrorCode } from "@/lib/types";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode | "NETWORK" | "UNKNOWN",
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiClientError(0, "NETWORK", "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ApiError | null)?.error;
    throw new ApiClientError(res.status, err?.code ?? "UNKNOWN", err?.message ?? `Lỗi ${res.status}`);
  }
  return data as T;
}

// TODO(spec): FaucetResponse chưa có trong web/lib/types.ts; khai báo tạm theo docs/api-contract.md > POST /faucet.
export interface FaucetResponse {
  avaxTxHash: `0x${string}`;
  tokenTxHash: `0x${string}`;
  avax: string;
  token: string; // Amount
}
