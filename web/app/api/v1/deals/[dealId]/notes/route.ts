// POST /api/v1/deals/:dealId/notes: lý do kèm đề xuất mức trừ (chủ trọ) hoặc kháng nghị (người thuê),
// để bên kia và bồi thẩm hiểu vì sao. Lưu ngoài chuỗi, nên chỉ cho ghi TRƯỚC khi giao dịch tương ứng lên chuỗi:
// đề xuất khi deal còn CHECKED_OUT, kháng nghị khi còn PROPOSED. Giao dịch đã lên thì trạng thái đổi và lý do bị khóa.
import { z } from "zod";
import { isAddressEqual } from "viem";
import { requireWallet } from "@/lib/server/auth";
import { dealContext } from "@/lib/server/deal-context";
import { ApiErr, json, parseDealId, route } from "@/lib/server/http";
import { upsertNote } from "@/lib/server/repo";

const Body = z.object({
  kind: z.enum(["proposal", "dispute"]),
  text: z.string().trim().min(1, "Lý do trống").max(500, "Lý do tối đa 500 ký tự"),
});

export const POST = route(async (req: Request, ctx: { params: Promise<{ dealId: string }> }) => {
  const dealId = parseDealId((await ctx.params).dealId);
  const wallet = await requireWallet(req);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiErr("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const { kind, text } = parsed.data;
  const { deal } = await dealContext(dealId);

  if (kind === "proposal") {
    if (!isAddressEqual(wallet, deal.landlord)) throw new ApiErr("FORBIDDEN", "Chỉ chủ trọ ghi lý do đề xuất");
    if (deal.stateName !== "CHECKED_OUT") throw new ApiErr("WRONG_STATE", "Đề xuất đã gửi lên chuỗi, lý do không sửa được nữa");
  } else {
    if (!isAddressEqual(wallet, deal.tenant)) throw new ApiErr("FORBIDDEN", "Chỉ người thuê ghi lý do kháng nghị");
    if (deal.stateName !== "PROPOSED") throw new ApiErr("WRONG_STATE", "Kháng nghị đã gửi lên chuỗi, lý do không sửa được nữa");
  }
  await upsertNote(dealId, kind, wallet, text);
  return json({ ok: true });
});
