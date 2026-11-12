// Trả lỗi đúng dạng docs/api-contract.md > Mã lỗi.
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
