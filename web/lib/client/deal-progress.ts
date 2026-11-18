// Các mốc của căn phòng và câu "việc cần làm" cho màn Chi tiết hợp đồng (task UI 09).
// Chỉ suy ra từ dữ liệu có sẵn (state, disputeKind, bộ ảnh, history) — không tạo mốc đã xong khi dữ liệu chưa xác nhận.
// Trạng thái luôn do contract quyết định (AGENTS.md luật 4); file này chỉ quyết định cách diễn đạt.
import type { DealState } from "@/lib/types";
import type { DealView } from "./deals-data";
import type { Role } from "./deal-actions";
import { formatDateTime } from "./date";

export type MilestoneStatus = "done" | "current" | "upcoming" | "skipped";

export interface Milestone {
  id: "deposit" | "checkin" | "active" | "checkout" | "payout";
  label: string;
  status: MilestoneStatus;
  /** Chữ trạng thái đi kèm (không dựa vào màu): "Đã hoàn tất", "Đang chờ"... */
  statusText: string;
  /** Một dòng giải thích dựa trên dữ liệu thật. */
  note: string;
  /** Giờ từ event on-chain (history), nếu API đã đồng bộ. */
  at?: string;
}

const STATUS_TEXT: Record<MilestoneStatus, string> = {
  done: "Đã hoàn tất",
  current: "Đang chờ",
  upcoming: "Chưa tới",
  skipped: "Không diễn ra",
};

/** Event trong history → mốc (tên event xem components/chain-proof.tsx > EVENT_TEXT). */
const EVENT_MILESTONE: Record<string, Milestone["id"]> = {
  Deposited: "deposit",
  CheckInSubmitted: "checkin",
  "StateChanged:ACTIVE": "active",
  CheckedOut: "checkout",
  Paid: "payout",
};

/** Mốc theo trạng thái contract. REFUNDED/CANCELLED không đi qua nhận/trả phòng nên không bị đánh dấu xong. */
export function milestonesFor(deal: DealView): Milestone[] {
  const { state: s, disputeKind } = deal.onchain;
  const hasIn = deal.photoSets.checkin !== null;
  const hasOut = deal.photoSets.checkout !== null;
  const mismatchDispute = s === "DISPUTED" && disputeKind === "MISMATCH";
  const deductionDispute = s === "DISPUTED" && disputeKind !== "MISMATCH";

  const m = (
    id: Milestone["id"],
    label: string,
    status: MilestoneStatus,
    note: string,
    statusText = STATUS_TEXT[status],
  ): Milestone => ({ id, label, status, statusText, note });

  // --- Gửi cọc
  let deposit: Milestone;
  if (s === "OPEN") deposit = m("deposit", "Gửi cọc", "current", "Chờ người thuê gửi cọc");
  else if (s === "CANCELLED") deposit = m("deposit", "Gửi cọc", "skipped", "Chủ trọ gỡ phòng khi chưa ai cọc");
  else deposit = m("deposit", "Gửi cọc", "done", "Người thuê đã gửi cọc vào contract");

  // --- Nhận phòng
  let checkin: Milestone;
  if (s === "OPEN") checkin = m("checkin", "Nhận phòng", "upcoming", "Chụp ảnh nhận phòng sau khi gửi cọc");
  else if (s === "CANCELLED") checkin = m("checkin", "Nhận phòng", "skipped", "Không có người thuê");
  else if (s === "RESERVED")
    checkin = m(
      "checkin",
      "Nhận phòng",
      "current",
      hasIn ? "Ảnh đã gửi, chủ trọ đang xem" : "Chờ người thuê chụp ảnh nhận phòng",
    );
  else if (s === "MISMATCH_REPORTED")
    checkin = m("checkin", "Nhận phòng", "current", "Người thuê báo phòng không đúng mô tả, chờ chủ trọ phản hồi");
  else if (mismatchDispute) checkin = m("checkin", "Nhận phòng", "current", "Bồi thẩm đang phân xử phòng sai mô tả");
  else if (s === "REFUNDED")
    checkin = hasIn
      ? m("checkin", "Nhận phòng", "done", "Ảnh nhận phòng đã gửi")
      : m("checkin", "Nhận phòng", "skipped", "Không có ảnh nhận phòng");
  else checkin = m("checkin", "Nhận phòng", "done", "Ảnh nhận phòng đã gửi");

  // --- Đang ở
  let active: Milestone;
  if (s === "ACTIVE") active = m("active", "Đang ở", "current", "Người thuê đang ở", "Đang diễn ra");
  else if (s === "ABANDON_REPORTED")
    active = m("active", "Đang ở", "current", "Chủ trọ báo người thuê đã bỏ đi, chờ người thuê trả lời");
  else if (s === "CANCELLED" || s === "REFUNDED") active = m("active", "Đang ở", "skipped", "Không diễn ra");
  else if (["CHECKED_OUT", "PROPOSED", "SETTLED"].includes(s) || deductionDispute)
    active = m("active", "Đang ở", "done", "Thời gian thuê đã qua");
  else active = m("active", "Đang ở", "upcoming", "Bắt đầu khi hết bước nhận phòng");

  // --- Trả phòng
  let checkout: Milestone;
  if (["CHECKED_OUT", "PROPOSED"].includes(s) || deductionDispute)
    checkout = m("checkout", "Trả phòng", "done", "Ảnh trả phòng đã gửi");
  else if (s === "SETTLED")
    checkout = hasOut
      ? m("checkout", "Trả phòng", "done", "Ảnh trả phòng đã gửi")
      : m("checkout", "Trả phòng", "skipped", "Không có ảnh trả phòng");
  else if (s === "CANCELLED" || s === "REFUNDED") checkout = m("checkout", "Trả phòng", "skipped", "Không diễn ra");
  else checkout = m("checkout", "Trả phòng", "upcoming", "Người thuê chụp ảnh trả phòng khi dọn đi");

  // --- Chia tiền
  let payout: Milestone;
  if (s === "SETTLED") payout = m("payout", "Chia tiền", "done", "Tiền đã chia theo contract");
  else if (s === "REFUNDED") payout = m("payout", "Chia tiền", "done", "Cọc đã hoàn theo contract", "Đã hoàn tất");
  else if (s === "CANCELLED") payout = m("payout", "Chia tiền", "skipped", "Không có tiền cọc để chia");
  else if (s === "CHECKED_OUT") payout = m("payout", "Chia tiền", "current", "Chờ chủ trọ đề xuất mức trừ");
  else if (s === "PROPOSED") payout = m("payout", "Chia tiền", "current", "Chờ người thuê trả lời đề xuất");
  else if (deductionDispute) payout = m("payout", "Chia tiền", "current", "Bồi thẩm đang phân xử mức trừ");
  else payout = m("payout", "Chia tiền", "upcoming", "Cọc được chia sau khi trả phòng hoặc khi hợp đồng kết thúc");

  const list = [deposit, checkin, active, checkout, payout];
  // Giờ lấy từ event on-chain (nếu API đã đồng bộ), chỉ gắn cho mốc đã hoàn tất.
  for (const h of deal.history) {
    const id = EVENT_MILESTONE[h.event];
    const target = list.find((x) => x.id === id);
    if (target && target.status === "done") target.at = formatDateTime(h.at);
  }
  return list;
}

export interface NextStep {
  /** true khi vai này có việc phải làm ngay (đến lượt mình); false khi chỉ là tình trạng để biết. */
  mine: boolean;
  title: string;
  body: string;
}

const todo = (title: string, body: string): NextStep => ({ mine: true, title, body });
const status = (title: string, body: string): NextStep => ({ mine: false, title, body });

/**
 * Câu nói rõ "bây giờ ai cần làm gì". `deadlinePassed`: hạn của bước hiện tại đã qua (đồng hồ máy).
 * Không nói tới số tiền; số tiền hiển thị ở khối tiền.
 */
export function nextStepFor(deal: DealView, role: Role, deadlinePassed: boolean): NextStep {
  const o = deal.onchain;
  const s: DealState = o.state;
  const hasIn = deal.photoSets.checkin !== null;

  if (s === "CANCELLED") return status("Chủ trọ đã gỡ phòng", "Phòng không có người cọc nên không có tiền nào đang được giữ.");
  if (s === "SETTLED")
    return status(
      "Hợp đồng đã kết thúc, tiền đã chia",
      "Tiền không còn nằm trong contract. Biên nhận cho biết mỗi bên đã nhận bao nhiêu và có link kiểm chứng.",
    );
  if (s === "REFUNDED")
    return status(
      "Hợp đồng đã kết thúc, cọc đã hoàn",
      "Không có bước nhận/trả phòng nào được tính. Biên nhận cho biết số tiền mỗi bên đã nhận.",
    );

  if (role === "tenant") {
    switch (s) {
      case "RESERVED":
        if (!hasIn && deadlinePassed)
          return status("Đã quá hạn gửi ảnh nhận phòng", "Hạn gửi ảnh đã qua; hợp đồng chờ được xử lý quá hạn.");
        if (!hasIn && o.checkInContested)
          return todo(
            "Chụp lại ảnh nhận phòng",
            "Chủ trọ đã phản đối ảnh trước. Chụp lại các vị trí trước hạn; lần này chủ trọ không phản đối được nữa.",
          );
        return hasIn
          ? status(
              "Chờ chủ trọ xem ảnh nhận phòng",
              "Chủ trọ có thể phản đối một lần trước hạn. Không phản đối thì hợp đồng chuyển sang Đang ở.",
            )
          : todo(
              "Chụp ảnh nhận phòng",
              "Chụp từng vị trí bằng camera trong app trước hạn. Nếu phòng không đúng mô tả, hãy báo trước khi chụp.",
            );
      case "MISMATCH_REPORTED":
        return status("Chờ chủ trọ phản hồi", "Bạn đã báo phòng không đúng mô tả. Chủ trọ im lặng tới hạn thì bạn được hoàn đủ cọc.");
      case "ACTIVE":
        return todo("Trả phòng khi dọn đi", "Bấm Trả phòng và chụp ảnh các vị trí như lúc nhận phòng.");
      case "ABANDON_REPORTED":
        return deadlinePassed
          ? status("Đã quá hạn xác nhận", "Hạn bạn xác nhận còn ở đã qua; hợp đồng chờ được xử lý quá hạn.")
          : todo("Xác nhận bạn vẫn đang ở", "Chủ trọ báo bạn đã bỏ đi. Bấm Tôi vẫn đang ở trước hạn để giữ hợp đồng.");
      case "CHECKED_OUT":
        return status("Chờ chủ trọ đề xuất mức trừ", "Bạn có thể xem báo cáo AI trong lúc chờ.");
      case "PROPOSED":
        return deadlinePassed
          ? status("Đã quá hạn kháng nghị", "Hạn trả lời đã qua; hợp đồng chờ được xử lý quá hạn.")
          : todo("Trả lời đề xuất của chủ trọ", "Đồng ý hoặc kháng nghị trước hạn. Im lặng tới hạn thì chia theo đề xuất của chủ trọ.");
      case "DISPUTED":
        return status("Bồi thẩm đang phân xử", "Bạn không cần làm gì thêm. Có thể xem số phiếu hiện tại.");
    }
  }

  if (role === "landlord") {
    switch (s) {
      case "OPEN":
        return status("Phòng đang chờ người thuê", "Chưa có người cọc nên chưa có tiền nào trong contract. Bạn có thể gỡ phòng khi chưa ai cọc.");
      case "RESERVED":
        if (!hasIn && o.checkInContested)
          return status("Chờ người thuê chụp lại", "Bạn đã dùng lần phản đối duy nhất. Người thuê chưa chụp lại kịp thì được hoàn cọc.");
        return hasIn
          ? todo("Xem ảnh nhận phòng", "Bạn có thể phản đối ảnh một lần trước hạn. Không phản đối thì hợp đồng chuyển sang Đang ở.")
          : status("Chờ người thuê chụp ảnh nhận phòng", "Người thuê chưa gửi ảnh tới hạn thì được hoàn cọc, bạn giữ phí giữ chỗ.");
      case "MISMATCH_REPORTED":
        return deadlinePassed
          ? status("Đã quá hạn phản đối", "Hạn phản đối đã qua; hợp đồng chờ được xử lý quá hạn.")
          : todo("Phản hồi báo phòng sai mô tả", "Phản đối trước hạn thì bồi thẩm phân xử. Im lặng thì người thuê được hoàn đủ cọc.");
      case "ACTIVE":
        return status("Người thuê đang ở", "Người thuê bấm Trả phòng khi dọn đi.");
      case "ABANDON_REPORTED":
        return status("Chờ người thuê xác nhận", "Người thuê im lặng tới hạn thì bạn nhận tiền cọc theo contract.");
      case "CHECKED_OUT":
        return deadlinePassed
          ? status("Đã quá hạn đề xuất", "Hạn đề xuất đã qua; hợp đồng chờ được xử lý quá hạn.")
          : todo("Đề xuất mức trừ", "Xem báo cáo AI rồi đề xuất. Không đề xuất tới hạn thì người thuê nhận lại đủ cọc.");
      case "PROPOSED":
        return status("Chờ người thuê trả lời", "Người thuê đồng ý, kháng nghị hoặc im lặng (khi đó chia theo đề xuất của bạn).");
      case "DISPUTED":
        return status("Bồi thẩm đang phân xử", "Bạn không cần làm gì thêm. Có thể xem số phiếu hiện tại.");
    }
  }

  // Người xem (không phải hai bên của hợp đồng): bồi thẩm hoặc người đang xem phòng.
  if (s === "OPEN") return status("Phòng đang trống", "Chưa ai gửi cọc. Xem phòng để biết điều khoản và gửi cọc.");
  if (s === "DISPUTED")
    return status("Vụ đang được phân xử", "Bạn không phải một trong hai bên. Nếu bạn là bồi thẩm của vụ này, mở bằng chứng để bỏ phiếu.");
  return status("Bạn đang xem hợp đồng này", "Bạn không phải chủ trọ hay người thuê của hợp đồng nên không có thao tác nào ở đây.");
}
