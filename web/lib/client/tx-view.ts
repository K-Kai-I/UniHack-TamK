// Logic thuần cho trạng thái giao dịch / mạng / faucet (task UI 19). Không React, không ví, không chuỗi.
// Test: node --import tsx --test lib/client/tx-view.test.ts
import type { TxState } from "./use-tx";

export type TxTone = "info" | "success" | "error";

export interface TxView {
  tone: TxTone;
  /** Vòng quay: chỉ khi có tác vụ thật đang chạy. */
  busy: boolean;
  /** "Bước 1/2" cho hai pha chờ; null với pha cuối. */
  step: string | null;
  title: string;
  note: string;
  /** Lời khuyên hành động tiếp theo (đã xử lý tới đâu, ký lại có an toàn không). */
  next: string;
}

/** Sau chừng này giây chờ xác nhận thì nói rõ là chuỗi đang chậm, đừng gửi lại. */
export const SLOW_PENDING_SECONDS = 30;

/**
 * Chữ cho 4 pha giao dịch (AGENTS.md: chờ ký/xác nhận, xong, lỗi).
 * Lỗi chia 3 loại theo bằng chứng trong state, không theo chuỗi lỗi:
 *  - reverted: chuỗi báo revert → chắc chắn chưa đổi gì.
 *  - có hash, không có cờ reverted: chưa biết kết quả → khuyên kiểm chứng trước khi ký lại.
 *  - không có hash: chưa gửi gì lên chuỗi.
 */
export function describeTx(state: TxState, doneText = "Giao dịch thành công"): TxView | null {
  const gasNote = state.sponsored ? "Phí gas do app trả." : "";
  switch (state.phase) {
    case "idle":
      return null;
    case "signing":
      return {
        tone: "info",
        busy: true,
        step: "Bước 1/2",
        title: "Chờ bạn ký",
        note: state.sponsored ? "Xác nhận trong cửa sổ ví. Phí gas do app trả." : "Xác nhận trong ví của bạn.",
        next: "Chưa có gì được gửi lên chuỗi. Hủy ở bước này thì không mất phí.",
      };
    case "pending":
      return {
        tone: "info",
        busy: true,
        step: "Bước 2/2",
        title: "Đã gửi, đang chờ chuỗi xác nhận",
        note: ["Thường mất vài giây.", gasNote].filter(Boolean).join(" "),
        next: "Đừng ký lại trong lúc chờ.",
      };
    case "success":
      return { tone: "success", busy: false, step: null, title: doneText, note: gasNote, next: "" };
    case "error": {
      const reason = state.error ?? "";
      if (state.reverted) {
        return {
          tone: "error",
          busy: false,
          step: null,
          title: "Chuỗi từ chối giao dịch",
          note: reason,
          next: `Hợp đồng chưa đổi gì, bạn có thể thử lại.${state.sponsored ? "" : " Phí gas của lần này có thể đã bị tính."}`,
        };
      }
      if (state.hash) {
        return {
          tone: "error",
          busy: false,
          step: null,
          title: "Chưa biết kết quả giao dịch",
          note: reason,
          next: "Giao dịch đã gửi nên có thể vẫn thành công. Mở Snowtrace kiểm tra trước khi ký lại.",
        };
      }
      return {
        tone: "error",
        busy: false,
        step: null,
        title: "Giao dịch chưa được gửi",
        note: reason,
        next: "Chưa có gì lên chuỗi, bạn có thể thử lại.",
      };
    }
  }
}

/** Chuỗi chậm: chỉ nói khi đang chờ xác nhận và đã quá ngưỡng. */
export function isSlowPending(state: TxState, waitedSeconds: number): boolean {
  return state.phase === "pending" && waitedSeconds >= SLOW_PENDING_SECONDS;
}

// ---------- Mạng ----------

export interface NetworkView {
  /** Hiện banner khi đã kết nối mà ví ở mạng khác. */
  show: boolean;
  /** Chain ID hiện tại của ví, để người dùng đối chiếu; null nếu ví không báo. */
  currentLabel: string | null;
}

export function networkView(isConnected: boolean, chainId: number | undefined, targetId: number): NetworkView {
  if (!isConnected || chainId === targetId) return { show: false, currentLabel: null };
  return { show: true, currentLabel: chainId === undefined ? null : `chain ${chainId}` };
}

/** Lỗi khi ví từ chối/không hỗ trợ chuyển mạng → câu hướng dẫn chuyển tay. Không tự bật gì thay người dùng. */
export function switchChainError(e: unknown, targetName: string, targetId: number): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/reject|denied|declined|cancel|user closed/i.test(msg)) {
    return `Bạn đã từ chối chuyển mạng. Bấm lại, hoặc chọn ${targetName} (chain ID ${targetId}) trong ví.`;
  }
  return `Ví không tự chuyển được mạng. Mở ví, chọn ${targetName} (chain ID ${targetId}) rồi quay lại.`;
}

// ---------- Faucet ----------

export type FaucetErrorKind = "rate" | "auth" | "missing" | "network" | "server" | "other";

export interface FaucetError {
  kind: FaucetErrorKind;
  message: string;
  /** Thử lại ngay có ích không (đã nhận hôm nay thì không). */
  retryable: boolean;
}

/** Mã lỗi API → câu cho người dùng. `err` là ApiClientError hoặc lỗi khác. */
export function faucetError(err: { status?: number; code?: string; message?: string } | null): FaucetError {
  if (err?.code === "RATE_LIMITED") {
    return {
      kind: "rate",
      message: "Ví này đã nhận tiền test trong 24 giờ qua. Mỗi ví nhận 1 lần mỗi 24 giờ. Nếu vừa nhận, số dư có thể cần vài giây để cập nhật.",
      retryable: false,
    };
  }
  if (err?.code === "UNAUTHORIZED" || err?.status === 401) {
    return { kind: "auth", message: "Phiên đăng nhập hết hạn. Đăng nhập lại rồi thử.", retryable: false };
  }
  if (err?.status === 404) {
    return { kind: "missing", message: "Faucet chưa sẵn sàng. Thử lại sau nhé.", retryable: true };
  }
  if (err?.code === "NETWORK") {
    return { kind: "network", message: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.", retryable: true };
  }
  if ((err?.status ?? 0) >= 500) {
    return { kind: "server", message: "Máy chủ faucet đang lỗi. Thử lại sau ít phút.", retryable: true };
  }
  return { kind: "other", message: err?.message || "Không nhận được tiền test. Thử lại sau một lát.", retryable: true };
}
