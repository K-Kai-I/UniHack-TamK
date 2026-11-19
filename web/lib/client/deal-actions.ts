// Bảng "Nút trên app theo trạng thái" (docs/contract-spec.md) viết thành code, để màn Chi tiết hợp đồng
// chỉ hiện nút khi contract đang ở đúng trạng thái. Nút "Xử lý quá hạn" (poke) không nằm ở đây vì nó hiện
// cho MỌI người khi canPoke = true.
import type { DealState, ListingVerdict } from "@/lib/types";
import type { DealView } from "./deals-data";

export type Role = "tenant" | "landlord" | "viewer";

/** Đã chia tiền xong (có biên nhận). */
export const PAID_STATES: readonly DealState[] = ["SETTLED", "REFUNDED"];
/** Đã kết thúc, không còn bước nào (gồm cả gỡ tin). */
export const TERMINAL_STATES: readonly DealState[] = ["SETTLED", "REFUNDED", "CANCELLED"];

export type ActionId =
  | "deposit"
  | "cancel"
  | "checkin"
  | "mismatch"
  | "contestCheckIn"
  | "contestMismatch"
  | "checkout"
  | "reportAbandon"
  | "checkoutForTenant"
  | "contestAbandon"
  | "viewReport"
  | "propose"
  | "respond"
  | "viewVotes"
  | "receipt";

export interface DealAction {
  id: ActionId;
  label: string;
  /** primary = nút chính to ở đáy màn; secondary = nút viền; danger = nút đỏ. */
  variant: "primary" | "secondary" | "danger";
  /** Mức trong AGENTS.md > Phạm vi, để biết nút nào làm trước. */
  level: "P0" | "P1" | "P2";
}

const act = (id: ActionId, label: string, variant: DealAction["variant"], level: DealAction["level"]): DealAction => ({
  id,
  label,
  variant,
  level,
});

/** Vai trò của ví đang xem: so địa chỉ ví với landlord / tenant đọc từ contract. */
export function roleOf(deal: DealView, wallet: string | undefined): Role {
  if (!wallet) return "viewer";
  const w = wallet.toLowerCase();
  if (w === deal.onchain.landlord.toLowerCase()) return "landlord";
  if (deal.onchain.tenant && w === deal.onchain.tenant.toLowerCase()) return "tenant";
  return "viewer";
}

/**
 * Chủ trọ được trả phòng thay từ lúc nào (ms): contract `submitCheckOut` cho chủ trọ gọi khi
 * `now > leaseEnd + checkOutGrace`. `checkOutGraceSec` lấy từ GET /config > timeouts; null = chưa biết.
 */
export function checkoutForTenantFrom(deal: DealView, checkOutGraceSec: number | null): number | null {
  if (checkOutGraceSec === null) return null;
  return Date.parse(deal.terms.dates.leaseEnd) + checkOutGraceSec * 1000;
}

/**
 * Nút theo trạng thái và vai trò. `now` dùng cho nút phụ thuộc mốc giờ (Trả phòng thay, Tôi vẫn đang ở).
 * `checkOutGraceSec`: GET /config > timeouts.checkOutGrace; null (chưa tải được) thì chưa hiện "Trả phòng thay".
 * Người xem không phải hai bên (bồi thẩm, người lạ) không có nút nào ở đây.
 */
export function actionsFor(deal: DealView, role: Role, now: number, checkOutGraceSec: number | null): DealAction[] {
  const s = deal.onchain.state;
  const hasCheckIn = deal.photoSets.checkin !== null;
  const deadlinePassed = deal.onchain.deadline !== null && now > Date.parse(deal.onchain.deadline);

  if (role === "tenant") {
    switch (s) {
      case "RESERVED":
        // submitCheckIn và reportMismatch chỉ hợp lệ trước deadline (contract-spec). Quá hạn thì chỉ còn poke.
        return hasCheckIn || deadlinePassed
          ? []
          // Một nút: chụp ảnh xong mới chọn "đúng mô tả, nhận phòng" hay "không giống, cho AI so" (cùng bộ ảnh).
          : [act("checkin", "Gửi ảnh nhận phòng", "primary", "P0")];
      case "ACTIVE":
        return [act("checkout", "Trả phòng", "primary", "P0")];
      case "ABANDON_REPORTED":
        // contestAbandon chỉ hợp lệ trước deadline (contract revert DeadlinePassed). Quá hạn thì chỉ còn poke.
        return deadlinePassed ? [] : [act("contestAbandon", "Tôi vẫn đang ở", "primary", "P1")];
      case "CHECKED_OUT":
        return [act("viewReport", "Xem báo cáo AI", "secondary", "P0")];
      case "PROPOSED":
        return [act("respond", "Xem đề xuất và trả lời", "primary", "P0")];
      case "DISPUTED":
        return [act("viewVotes", "Xem phiếu bồi thẩm", "secondary", "P1")];
      case "SETTLED":
      case "REFUNDED":
        return [act("receipt", "Xem biên nhận", "secondary", "P0")];
      default:
        return [];
    }
  }

  if (role === "landlord") {
    switch (s) {
      case "OPEN":
        return [act("cancel", "Gỡ phòng", "danger", "P0")];
      case "RESERVED":
        // contestCheckIn: đã có ảnh, chưa quá hạn phản đối, và chỉ một lần (contract-spec > contestCheckIn).
        return hasCheckIn && !deadlinePassed && !deal.onchain.checkInContested
          ? [act("contestCheckIn", "Phản đối ảnh nhận phòng", "secondary", "P2")]
          : [];
      case "MISMATCH_REPORTED":
        // contestMismatch chỉ hợp lệ trước deadline.
        return deadlinePassed ? [] : [act("contestMismatch", "Phản đối", "primary", "P1")];
      case "ACTIVE": {
        const list = [act("reportAbandon", "Báo người thuê bỏ đi", "secondary", "P1")];
        const from = checkoutForTenantFrom(deal, checkOutGraceSec);
        if (from !== null && now > from) list.unshift(act("checkoutForTenant", "Trả phòng thay", "primary", "P1"));
        return list;
      }
      case "CHECKED_OUT":
        // proposeDeduction chỉ hợp lệ trước deadline; quá hạn vẫn xem được báo cáo.
        return deadlinePassed
          ? [act("viewReport", "Xem báo cáo AI", "secondary", "P0")]
          : [act("propose", "Đề xuất mức trừ", "primary", "P0"), act("viewReport", "Xem báo cáo AI", "secondary", "P0")];
      case "DISPUTED":
        return [act("viewVotes", "Xem phiếu bồi thẩm", "secondary", "P1")];
      case "SETTLED":
      case "REFUNDED":
        return [act("receipt", "Xem biên nhận", "secondary", "P0")];
      default:
        return [];
    }
  }

  return [];
}

/**
 * Hạn chót đang đếm ngược: ai đang phải làm gì, và hết hạn thì `poke` làm gì
 * (bảng Tham số thời gian trong contract-spec). null khi bước hiện tại không có hạn.
 */
export function deadlineInfo(state: DealState, hasCheckIn: boolean): { waiting: string; onTimeout: string } | null {
  switch (state) {
    case "RESERVED":
      return hasCheckIn
        ? { waiting: "Thời gian chủ trọ xem ảnh nhận phòng", onTimeout: "Hợp đồng chuyển sang Đang ở." }
        : {
            waiting: "Hạn người thuê gửi ảnh nhận phòng",
            onTimeout: "Người thuê được hoàn cọc, trừ phí giữ chỗ cho chủ trọ.",
          };
    case "MISMATCH_REPORTED":
      return { waiting: "Hạn chủ trọ phản đối", onTimeout: "Người thuê được hoàn đủ tiền cọc." };
    case "ABANDON_REPORTED":
      return { waiting: "Hạn người thuê xác nhận còn ở", onTimeout: "Chủ trọ nhận tiền cọc." };
    case "CHECKED_OUT":
      return { waiting: "Hạn chủ trọ đề xuất mức trừ", onTimeout: "Chia tiền với mức trừ 0: người thuê nhận lại đủ cọc." };
    case "PROPOSED":
      return { waiting: "Hạn người thuê trả lời", onTimeout: "Chia tiền theo mức chủ trọ đề xuất." };
    case "DISPUTED":
      return { waiting: "Hạn bồi thẩm bỏ phiếu", onTimeout: "Phân xử theo quy tắc hết hạn của tranh chấp." };
    default:
      return null;
  }
}

const absDiff = (a: bigint, b: bigint) => (a > b ? a - b : b - a);

/**
 * Tranh chấp mức trừ: phiếu AI về bên có con số gần aiAmount hơn (contract `disputeProposal`).
 * Về chủ trọ chỉ khi |D − AI| < |counter − AI|; bằng nhau thì về người thuê.
 */
export function deductionAiSide(proposed: bigint, counter: bigint, aiAmount: bigint): "landlord" | "tenant" {
  return absDiff(proposed, aiAmount) < absDiff(counter, aiAmount) ? "landlord" : "tenant";
}

/**
 * Bên được cộng sẵn phiếu AI lúc mở tranh chấp (contract `_openDispute`). null = không có phiếu AI.
 *  - DEDUCTION: bên có con số gần aiAmount hơn; bằng nhau thì người thuê.
 *  - MISMATCH: người thuê, khi con dấu ghi "khác rõ" (đi qua contestMismatch). "Không rõ" thì không có phiếu.
 *    hasAiSeal không đủ để phân biệt (con dấu "không rõ" cũng bật hasAiSeal), nên xem deal có từng qua
 *    MISMATCH_REPORTED không (sự kiện StateChanged trong history, đọc từ chuỗi): có thì chắc chắn là contestMismatch.
 *    history trống (indexer chưa kịp) thì mới dựa vào kết luận AI trong database.
 */
export function aiVoteSide(deal: DealView, mismatchVerdict?: ListingVerdict | null): "landlord" | "tenant" | null {
  const o = deal.onchain;
  if (!o.hasAiSeal) return null;
  if (o.disputeKind === "MISMATCH") {
    const contested = deal.history.some((h) => h.event === "StateChanged:MISMATCH_REPORTED");
    return contested || mismatchVerdict === "MISMATCH" ? "tenant" : null;
  }
  if (o.disputeKind !== "DEDUCTION") return null;
  return deductionAiSide(BigInt(o.proposedAmount), BigInt(o.counterAmount), BigInt(o.aiAmount));
}

/** Hết hạn bồi thẩm mà chưa bên nào đủ 2 phiếu thì `poke` chia thế nào (contract `_juryExpired`). */
export function juryExpiryText(deal: DealView, vnd: (a: bigint) => string): string {
  const o = deal.onchain;
  if (o.disputeKind === "MISMATCH") {
    return o.votesLandlord > o.votesTenant
      ? "Chủ trọ nhiều phiếu hơn: người thuê được hoàn cọc, chủ trọ giữ phí giữ chỗ."
      : "Chủ trọ không nhiều phiếu hơn: người thuê được hoàn đủ cọc.";
  }
  const C = BigInt(o.deposit);
  const AI = BigInt(o.aiAmount);
  if (o.hasAiSeal) return `Trừ theo con số AI đã ký: ${vnd(AI < C ? AI : C)}.`;
  return `Trừ trung bình hai con số: ${vnd((BigInt(o.proposedAmount) + BigInt(o.counterAmount)) / 2n)}.`;
}

/** Câu cho nút "Xử lý quá hạn": bấm thì contract làm gì (contract `poke`). */
export function pokeEffect(deal: DealView, vnd: (a: bigint) => string): string {
  const s = deal.onchain.state;
  if (s === "OPEN") return "Đã quá hạn dọn vào mà chưa ai cọc: đóng tin.";
  if (s === "DISPUTED") return juryExpiryText(deal, vnd);
  if (s === "PROPOSED") return `Chia tiền theo mức chủ trọ đề xuất (trừ ${vnd(BigInt(deal.onchain.proposedAmount))}).`;
  return deadlineInfo(s, deal.photoSets.checkin !== null)?.onTimeout ?? "";
}

/** 5 bước hiển thị trên thanh tiến trình. */
export const STEPS = ["Gửi cọc", "Nhận phòng", "Đang ở", "Trả phòng", "Chia tiền"] as const;

/** Bước đang làm (0–4); 5 = xong hết; null = không vẽ thanh (đã gỡ tin). */
export function stepIndex(deal: DealView): number | null {
  const s: DealState = deal.onchain.state;
  switch (s) {
    case "OPEN":
      return 0;
    case "RESERVED":
    case "MISMATCH_REPORTED":
      return 1;
    case "ACTIVE":
    case "ABANDON_REPORTED":
      return 2;
    case "CHECKED_OUT":
    case "PROPOSED":
      return 3;
    case "DISPUTED":
      return deal.onchain.disputeKind === "MISMATCH" ? 1 : 3;
    case "SETTLED":
    case "REFUNDED":
      return 5;
    case "CANCELLED":
      return null;
  }
}
