// Đổi lỗi giao dịch thành câu tiếng Việt dễ hiểu (AGENTS.md: "lỗi kèm lý do dễ hiểu").
// Lỗi custom của contract: xem docs/contract-spec.md > Lỗi.
import { BaseError, ContractFunctionRevertedError } from "viem";

const CONTRACT_ERRORS: Record<string, string> = {
  NotLandlord: "Chỉ chủ trọ của phòng này làm được việc này.",
  NotTenant: "Chỉ người thuê của phòng này làm được việc này.",
  NotJuror: "Ví này không phải bồi thẩm.",
  PartyCannotVote: "Chủ trọ và người thuê không được bỏ phiếu.",
  LandlordCannotRent: "Bạn là chủ trọ của phòng này nên không tự đặt cọc được.",
  WrongState: "Phòng đang ở bước khác, chưa làm được việc này.",
  DeadlinePassed: "Đã quá hạn chót của bước này.",
  DeadlineNotReached: "Chưa tới hạn chót nên chưa xử lý được.",
  InvalidAmount: "Số tiền không hợp lệ (cọc phải lớn hơn 0 và không nhỏ hơn phí giữ chỗ).",
  InvalidDates: "Ngày hết hạn thuê phải sau ngày dọn vào.",
  CheckInAlreadySubmitted: "Ảnh nhận phòng đã được gửi rồi.",
  AlreadyContested: "Việc này đã được phản đối rồi.",
  AlreadyVoted: "Bạn đã bỏ phiếu rồi.",
  BadSignature: "Con dấu AI không hợp lệ.",
  BadVerdict: "Kết luận không hợp lệ.",
  EmptyHash: "Bộ ảnh chưa được máy chủ khóa (hash rỗng). Gửi lại ảnh rồi thử lại.",
  NothingToPoke: "Hiện không có gì cần xử lý.",
  NotImplemented: "Hàm này contract chưa làm xong.",
};

/** Người dùng bấm hủy ở cửa sổ ký. */
function isUserRejection(msg: string): boolean {
  return /reject|denied|declined|cancel|user closed|exited|closed the modal/i.test(msg);
}

/** Trả về câu tiếng Việt cho mọi loại lỗi (viem, Privy, ví ngoài). */
export function friendlyTxError(e: unknown): string {
  if (e instanceof BaseError) {
    const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && CONTRACT_ERRORS[name]) return CONTRACT_ERRORS[name];
      if (name) return `Contract từ chối giao dịch (${name}).`;
    }
  }

  const msg = e instanceof Error ? `${e.message} ${(e as { details?: string }).details ?? ""}` : String(e);

  if (isUserRejection(msg)) return "Bạn đã hủy ký giao dịch.";
  if (/insufficient funds|exceeds the balance|gas required exceeds/i.test(msg))
    return "Ví hết AVAX để trả phí giao dịch. Bấm “Nhận tiền test” rồi thử lại.";
  if (/no data|returned no data|not a contract/i.test(msg))
    return "Không đọc được contract. Có thể contract chưa được deploy lên Fuji.";
  if (/network|fetch|timeout|timed out/i.test(msg)) return "Mất kết nối mạng. Kiểm tra mạng rồi thử lại.";
  if (/sponsor/i.test(msg))
    return "Không trả gas hộ được (Privy chưa bật cho mạng Fuji hoặc hết hạn mức). Thử lại hoặc nhận AVAX test.";
  return "Giao dịch không thành công. Thử lại sau một lát.";
}
