// Màn "Hợp đồng của tôi": GET /deals?wallet= (docs/api-contract.md, cần đăng nhập).
// Không có thông báo đẩy (user-flow > Chưa có trong spec #1): chủ trọ mở màn này để thấy có người vừa cọc.
// Trạng thái đọc từ contract mỗi lần gọi (AGENTS.md luật 4); server chỉ ghép thêm tiêu đề và ảnh bìa.
import type { Address, Amount, DealState, IsoTime } from "@/lib/types";
import { apiFetch } from "./api";
import { DEALS_MOCK, fetchDealView, MOCK_DEAL_IDS } from "./deals-data";

// TODO(spec): web/lib/types.ts và api-contract chưa có kiểu response của GET /deals?wallet=. Khai báo theo route của Khải
// (web/app/api/v1/deals/route.ts).
export interface MyDealItem {
  dealId: number;
  listingId: string;
  role: "landlord" | "tenant";
  state: DealState;
  deadline: IsoTime | null;
  title: string;
  address: string;
  depositAmount: Amount;
  coverUrl: string | null;
}

/** Các hợp đồng mà ví đang đăng nhập là chủ trọ hoặc người thuê. Server lấy ví từ token, không tin ví client gửi. */
export async function fetchMyDeals(wallet: Address, token: string | null): Promise<MyDealItem[]> {
  if (DEALS_MOCK) return mockMyDeals();
  const { items } = await apiFetch<{ items: MyDealItem[] }>(`/deals?wallet=${wallet.toLowerCase()}`, { token });
  return items;
}

// ------------------------------------------------------------------ bản giả

async function mockMyDeals(): Promise<MyDealItem[]> {
  const deals = await Promise.all(MOCK_DEAL_IDS.map((id) => fetchDealView(id)));
  return deals.map((d, i) => ({
    dealId: d.dealId,
    listingId: `lst_mock_${d.dealId}`,
    // Bản giả: phòng chưa ai cọc là của mình (chủ trọ); còn lại xen kẽ hai vai để thử giao diện.
    role: d.onchain.state === "OPEN" || i % 2 === 1 ? "landlord" : "tenant",
    state: d.onchain.state,
    deadline: d.onchain.deadline,
    title: d.terms.room.title,
    address: d.terms.room.address,
    depositAmount: d.onchain.deposit,
    coverUrl: null,
  }));
}
