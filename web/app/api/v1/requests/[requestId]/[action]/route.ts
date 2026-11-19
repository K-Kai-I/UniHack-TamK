// POST /api/v1/requests/:requestId/approve | reject | cancel
// approve (chủ trọ): ghép ngày người thuê chọn vào điều khoản của phòng → tạo tin đăng riêng → trả createDealArgs.
//   Chủ trọ ký createDeal rồi gọi POST /listings/:listingId/onchain như luồng đăng phòng cũ. Gọi lại approve khi
//   tin đăng chưa lên chuỗi thì trả lại đúng tin đăng đó (không tạo deal thứ hai).
// reject (chủ trọ), cancel (người thuê): chỉ khi yêu cầu đang PENDING.
import { hashJson } from "@/lib/hash";
import { requireWallet } from "@/lib/server/auth";
import { readTimeouts } from "@/lib/server/chain";
import { ApiErr, json, route } from "@/lib/server/http";
import { assertDatesFree } from "@/lib/server/booking";
import { linkOrphanListings } from "@/lib/server/link-listings";
import { getListing, getRequest, getRoom, insertListing, rejectPendingOverlapping, setRequestStatus } from "@/lib/server/repo";
import { createDealArgsOf, termsWithDates } from "@/lib/server/terms-builder";

const ACTIONS = ["approve", "reject", "cancel"] as const;

export const POST = route(async (req: Request, ctx: { params: Promise<{ requestId: string; action: string }> }) => {
  const wallet = await requireWallet(req);
  const { requestId, action } = await ctx.params;
  if (!(ACTIONS as readonly string[]).includes(action)) throw new ApiErr("NOT_FOUND", "Không có thao tác này");
  const q = await getRequest(requestId);
  if (!q) throw new ApiErr("NOT_FOUND", "Không có yêu cầu này");

  if (action === "cancel") {
    if (q.tenant !== wallet) throw new ApiErr("FORBIDDEN", "Chỉ người gửi yêu cầu mới hủy được");
    if (!(await setRequestStatus(q.id, "PENDING", "CANCELLED"))) throw new ApiErr("WRONG_STATE", "Yêu cầu không còn chờ duyệt");
    return json({ ok: true, status: "CANCELLED" });
  }

  if (q.landlord !== wallet) throw new ApiErr("FORBIDDEN", "Chỉ chủ trọ của phòng mới duyệt được");

  if (action === "reject") {
    if (!(await setRequestStatus(q.id, "PENDING", "REJECTED"))) throw new ApiErr("WRONG_STATE", "Yêu cầu không còn chờ duyệt");
    return json({ ok: true, status: "REJECTED" });
  }

  // approve: đã duyệt trước đó mà chưa lên chuỗi (vd từ chối ký giữa chừng) thì trả lại đúng tin đăng cũ.
  if (q.status === "APPROVED" && q.listing_id) {
    let old = await getListing(q.listing_id);
    if (!old) throw new ApiErr("NOT_FOUND", "Không thấy tin đăng của yêu cầu này");
    // Chống tạo deal thứ hai: lần ký trước có thể đã lên chuỗi mà chưa gắn (mạng lỗi lúc gọi /onchain).
    // Dò chuỗi một lượt trước khi bảo frontend ký lại.
    if (!old.deal_id) {
      await linkOrphanListings().catch((e) => console.error("[approve] link", (e as Error).message?.split("\n")[0]));
      old = (await getListing(q.listing_id)) ?? old;
    }
    return json({ listingId: old.id, dealId: old.deal_id ? Number(old.deal_id) : null, termsHash: old.terms_hash,
      createDealArgs: createDealArgsOf(old.terms, old.terms_hash) });
  }
  if (q.status !== "PENDING") throw new ApiErr("WRONG_STATE", "Yêu cầu không còn chờ duyệt");

  // Contract chỉ nhận cọc trước moveInDate + moveInGrace: ngày đã qua thì không duyệt được nữa.
  const { moveInGrace } = await readTimeouts();
  if (new Date(q.move_in).getTime() + moveInGrace * 1000 < Date.now() + 10 * 60 * 1000) {
    throw new ApiErr("WRONG_STATE", "Ngày dọn vào đã qua hoặc quá sát. Người thuê cần gửi yêu cầu mới.");
  }
  const room = await getRoom(q.room_id);
  if (!room) throw new ApiErr("NOT_FOUND", "Không có phòng này");
  // Đã duyệt một yêu cầu khác trùng ngày (hợp đồng còn giữ phòng) thì không duyệt thêm.
  await assertDatesFree(q.room_id, new Date(q.move_in), new Date(q.lease_end), q.id);
  const terms = termsWithDates(room.template, new Date(q.move_in), new Date(q.lease_end));
  const termsHash = hashJson(terms);
  const listingId = await insertListing(room.landlord, terms, termsHash, q.id);
  if (!(await setRequestStatus(q.id, "PENDING", "APPROVED", listingId))) {
    throw new ApiErr("WRONG_STATE", "Yêu cầu vừa được xử lý ở nơi khác, tải lại trang");
  }
  // Các yêu cầu đang chờ trùng ngày không thể được duyệt nữa: từ chối luôn để người thuê biết mà chọn ngày khác.
  await rejectPendingOverlapping(q.room_id, new Date(q.move_in), new Date(q.lease_end), q.id);
  return json({ listingId, dealId: null, termsHash, createDealArgs: createDealArgsOf(terms, termsHash) }, 201);
});
