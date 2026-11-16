// Trả lỗi đúng dạng docs/api-contract.md > Mã lỗi, và bọc route để lỗi ném ra thành JSON.
import "server-only";
import { NextResponse } from "next/server";
import type { ApiErrorCode } from "../types";

const STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  WRONG_STATE: 409,
  CHAIN_MISMATCH: 409,
  FILE_TOO_LARGE: 413,
  MISSING_POSITIONS: 422,
  RATE_LIMITED: 429,
  AI_FAILED: 502,
};

export function apiError(code: ApiErrorCode, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status: STATUS[code] });
}

/** Lỗi nghiệp vụ: ném ở bất cứ đâu, route() đổi thành JSON đúng mã. */
export class ApiErr extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Bọc handler: ApiErr -> mã lỗi của spec; lỗi khác -> 400 kèm thông báo, không lộ stack. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiErr) return apiError(e.code, e.message, e.extra);
      console.error(e);
      return apiError("BAD_REQUEST", (e as Error)?.message ?? "Lỗi không xác định");
    }
  };
}

/** JSON có bigint: đổi bigint thành chuỗi. */
export function json(value: unknown, status = 200) {
  const text = JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  return new NextResponse(text, { status, headers: { "content-type": "application/json" } });
}

/** Đọc body JSON, sai thì BAD_REQUEST. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiErr("BAD_REQUEST", "Body phải là JSON");
  }
}

/** dealId trên URL: số nguyên dương. */
export function parseDealId(raw: string): bigint {
  if (!/^\d{1,18}$/.test(raw) || raw === "0") throw new ApiErr("BAD_REQUEST", "dealId không hợp lệ");
  return BigInt(raw);
}

/** URL tuyệt đối của ảnh, qua route GET /api/v1/photos/:id. */
export function photoUrl(req: Request, photoId: string): string {
  return new URL(`/api/v1/photos/${photoId}`, req.url).toString();
}
