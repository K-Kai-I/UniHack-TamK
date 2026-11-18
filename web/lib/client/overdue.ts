// Quá hạn và hành động phụ (task UI 18): các hàm thuần, không gọi ví hay chuỗi.
// Contract mới là nơi quyết định `poke` có chạy được không (AGENTS.md luật 4); file này chỉ quyết định cách DIỄN ĐẠT
// "chưa tới hạn / đã quá hạn / chờ contract / đã có người xử lý", để UI không nói chặt hơn hay lỏng hơn contract.
import type { DealState } from "@/lib/types";
import { PAID_STATES, TERMINAL_STATES, type Role } from "./deal-actions";
import type { DealView } from "./deals-data";

/**
 * Giai đoạn của hạn chót hiện tại.
 *  - none: bước này không có hạn (hoặc hợp đồng đã kết thúc).
 *  - counting: còn hạn, các bên còn làm được việc của mình.
 *  - waiting: đồng hồ máy báo quá hạn nhưng contract chưa cho `poke` (khối chuỗi mới nhất thường chậm vài giây).
 *  - ready: `canPoke` = true, ai cũng bấm được.
 */
export type OverdueStage = "none" | "counting" | "waiting" | "ready";

export function overdueStage(
  state: DealState,
  deadline: string | null,
  now: number,
  canPoke: boolean,
): OverdueStage {
  if (TERMINAL_STATES.includes(state)) return "none";
  if (canPoke) return "ready";
  if (deadline === null) return "none";
  return now >= Date.parse(deadline) ? "waiting" : "counting";
}

/** Kết quả sau khi một giao dịch chuyển bước. */
export type StepOutcome =
  | { kind: "paid" } // đã chia tiền / hoàn cọc: mời xem biên nhận
  | { kind: "closed" } // tin đã đóng (gỡ phòng, hoặc quá hạn dọn vào mà chưa ai cọc)
  | { kind: "moved"; state: DealState } // sang bước mới, còn việc phía sau
  | { kind: "same" }; // chưa thấy trạng thái đổi (đọc lại chưa kịp, hoặc chưa tải được)

/**
 * So trạng thái trước và sau giao dịch. `after` là bản deal vừa tải lại; thiếu (chưa tải được) thì "same":
 * không khẳng định tiền đã chia khi chưa đọc được từ contract.
 */
export function stepOutcome(before: DealState, after: DealView | undefined): StepOutcome {
  if (!after) return { kind: "same" };
  const s = after.onchain.state;
  if (PAID_STATES.includes(s)) return { kind: "paid" };
  if (s === "CANCELLED") return { kind: "closed" };
  if (s !== before) return { kind: "moved", state: s };
  return { kind: "same" };
}

/**
 * Câu giải thích vì sao KHÔNG còn nút của bước này (nút biến mất im lặng dễ bị hiểu là app lỗi).
 * Chỉ nói những điều contract-spec khẳng định; không có gì đáng nói thì null.
 */
export function missingActionNote(deal: DealView, role: Role, now: number): string | null {
  const o = deal.onchain;
  const passed = o.deadline !== null && now > Date.parse(o.deadline);
  const hasCheckIn = deal.photoSets.checkin !== null;

  if (role === "landlord" && o.state === "RESERVED" && hasCheckIn) {
    if (o.checkInContested) return "Bạn đã phản đối ảnh nhận phòng một lần. Contract không cho phản đối lần hai.";
    if (passed) return "Đã hết thời gian phản đối ảnh nhận phòng, nên nút phản đối không còn.";
  }
  if (role === "landlord" && o.state === "MISMATCH_REPORTED" && passed)
    return "Đã hết hạn phản đối nên nút phản đối không còn. Người thuê sẽ được hoàn đủ cọc khi hợp đồng được xử lý quá hạn.";
  if (role === "landlord" && o.state === "CHECKED_OUT" && passed)
    return "Đã hết hạn đề xuất nên nút đề xuất không còn. Người thuê sẽ nhận lại đủ cọc khi hợp đồng được xử lý quá hạn.";
  if (role === "tenant" && o.state === "RESERVED" && !hasCheckIn && passed)
    return "Đã hết hạn nên không gửi ảnh nhận phòng hay báo phòng sai mô tả được nữa. Bạn sẽ được hoàn cọc, trừ phí giữ chỗ, khi hợp đồng được xử lý quá hạn.";
  if (role === "tenant" && o.state === "PROPOSED" && passed)
    return "Đã hết hạn kháng nghị. Bạn vẫn có thể đồng ý ngay; nếu không, hợp đồng chia theo đề xuất của chủ trọ khi được xử lý quá hạn.";
  if (role === "tenant" && o.state === "ABANDON_REPORTED" && passed)
    return "Đã hết hạn nên nút “Tôi vẫn đang ở” không còn. Hợp đồng chờ được xử lý quá hạn, chủ trọ sẽ nhận tiền cọc.";
  return null;
}
