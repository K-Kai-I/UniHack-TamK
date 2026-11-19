import "server-only";
// Chống đặt trùng ngày cho cùng một phòng (rental requests).
// Một yêu cầu ĐÃ DUYỆT giữ khoảng ngày của nó, trừ khi hợp đồng sinh ra từ nó không còn giữ phòng:
// đã hủy, đã kết thúc (chia tiền / hoàn cọc), hoặc vẫn OPEN mà đã quá hạn gửi cọc (moveInDate + moveInGrace).
// Trạng thái hợp đồng đọc từ chuỗi (AGENTS.md luật 4), không lưu cột trạng thái trong database.
import { readDeal, readTimeouts } from "./chain";
import { ApiErr } from "./http";
import { listApprovedForRoom, listApprovedOverlapping, type RequestRow } from "./repo";

const FREE_STATES = ["CANCELLED", "SETTLED", "REFUNDED"];

async function stillHolds(q: RequestRow, moveInGraceMs: number): Promise<boolean> {
  if (!q.deal_id) return true; // đã duyệt, chủ trọ đang ký: vẫn giữ chỗ
  const d = await readDeal(BigInt(q.deal_id));
  if (FREE_STATES.includes(d.stateName)) return false;
  if (d.stateName === "OPEN" && Date.now() > new Date(q.move_in).getTime() + moveInGraceMs) return false;
  return true;
}

async function holding(rows: RequestRow[]): Promise<RequestRow[]> {
  if (rows.length === 0) return [];
  const { moveInGrace } = await readTimeouts();
  const keep = await Promise.all(rows.map((q) => stillHolds(q, moveInGrace * 1000)));
  return rows.filter((_, i) => keep[i]);
}

const vnDate = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

/** Ném WRONG_STATE nếu [moveIn, leaseEnd) trùng một khoảng ngày phòng đã có người thuê. */
export async function assertDatesFree(roomId: string, moveIn: Date, leaseEnd: Date, excludeId: string | null = null) {
  const taken = await holding(await listApprovedOverlapping(roomId, moveIn, leaseEnd, excludeId));
  if (taken.length > 0) {
    const t = taken[0];
    throw new ApiErr("WRONG_STATE", `Phòng đã có người thuê từ ${vnDate(t.move_in)} đến ${vnDate(t.lease_end)}. Hãy chọn ngày khác.`);
  }
}

/** Các khoảng ngày phòng đang có người thuê (cho màn chi tiết phòng hiện và chặn chọn trùng). */
export async function bookedRanges(roomId: string): Promise<{ moveInDate: string; leaseEnd: string }[]> {
  const rows = await holding(await listApprovedForRoom(roomId));
  return rows.map((q) => ({ moveInDate: q.move_in, leaseEnd: q.lease_end }));
}
