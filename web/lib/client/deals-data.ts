// Dữ liệu cho màn "Chi tiết hợp đồng" (docs/user-flow.md, GĐ 1–6).
// Hình dạng khớp docs/api-contract.md > GET /deals/:dealId. Phần `onchain` do API đọc từ contract mỗi lần gọi
// (AGENTS.md luật 4), frontend không tự lưu trạng thái.
// API của Khải chưa xong thì chạy BẢN GIẢ (NEXT_PUBLIC_MOCK_API khác "0"), đủ 11 trạng thái để thử giao diện.
import type {
  Address,
  AiJobStatus,
  Amount,
  DamageReport,
  DealState,
  DisputeKind,
  Hash,
  IsoTime,
  MismatchReport,
  Terms,
} from "@/lib/types";
import { DEAL_STATES } from "@/lib/types";
import { apiFetch, ApiClientError } from "./api";
import { TERMINAL_STATES } from "./deal-actions";
import { fetchDeal, NotFoundError, WALL_SAMPLE_TERMS } from "./rooms-data";

// TODO(spec): web/lib/types.ts chưa có kiểu response của GET /deals/:dealId. Khai báo tạm theo api-contract.
export interface DealOnchain {
  state: DealState;
  stateIndex: number;
  landlord: Address;
  /** null khi chưa ai cọc (contract trả address(0)). */
  tenant: Address | null;
  deposit: Amount;
  reserveFee: Amount;
  /** Hạn của bước đang chờ. null = không có hạn (contract lưu 0).
   *  TODO(spec): api-contract chưa nói deadline = 0 trả về gì; tạm hiểu là null. */
  deadline: IsoTime | null;
  canPoke: boolean;
  /** Chủ trọ đã dùng lần phản đối ảnh nhận phòng duy nhất (nhánh D). API trả từ getDeal; bản giả không có = false. */
  checkInContested?: boolean;
  proposedAmount: Amount;
  aiAmount: Amount;
  counterAmount: Amount;
  hasAiSeal: boolean;
  disputeKind: DisputeKind;
  votesLandlord: number;
  votesTenant: number;
  yieldOn: boolean;
  yieldGross: Amount;
}

export interface PhotoSetView {
  photoSetId?: string;
  setHash: Hash;
  items: { positionId: string; url: string }[];
}

export interface DealView {
  dealId: number;
  listingId?: string;
  onchain: DealOnchain;
  terms: Terms;
  /** URL ảnh đăng tin, cùng thứ tự với terms.listingPhotos. */
  listingPhotoUrls: string[];
  /** URL ảnh ví dụ theo positionId. */
  examplePhotoUrls: Record<string, string>;
  photoSets: { checkin: PhotoSetView | null; checkout: PhotoSetView | null; mismatch: PhotoSetView | null };
  reports: { damage: DamageReport | null; mismatch: MismatchReport | null };
  /** Tiến độ AI. null = chưa ai bấm chạy. */
  aiStatus: { damage: AiJobStatus | null; mismatch: AiJobStatus | null };
  /** Lời giải thích thêm của OpenAI: chỉ tham khảo, KHÔNG nằm trong báo cáo đã ký. */
  explanation: string | null;
  /** P1: chưa kịp thì API trả mảng rỗng. */
  history: { event: string; txHash: Hash; at: IsoTime }[];
}

const USE_MOCK = process.env.NEXT_PUBLIC_MOCK_API !== "0";
export const DEALS_MOCK = USE_MOCK;

const ZERO = "0x0000000000000000000000000000000000000000";

/** GET /deals/:dealId. Ném NotFoundError khi deal không tồn tại (404 NOT_FOUND). */
export async function fetchDealView(dealId: number): Promise<DealView> {
  if (USE_MOCK) return mockDealView(dealId);
  try {
    const d = await apiFetch<DealView>(`/deals/${dealId}`);
    // Bản API cũ chưa có các trường này: điền mặc định để UI không vỡ.
    d.listingPhotoUrls ??= [];
    d.examplePhotoUrls ??= {};
    d.aiStatus ??= { damage: null, mismatch: null };
    d.explanation ??= null;
    d.history ??= [];
    // address(0) nghĩa là chưa có người thuê; đổi về null để UI so sánh ví cho gọn.
    if (d.onchain.tenant && d.onchain.tenant.toLowerCase() === ZERO) d.onchain.tenant = null;
    return d;
  } catch (e) {
    if (e instanceof ApiClientError && e.code === "NOT_FOUND") throw new NotFoundError(e.message);
    throw e;
  }
}

// ------------------------------------------------------------------ bản giả

const A = (n: string) => `0x${n.repeat(40).slice(0, 40)}` as Address;
const H = (n: string) => `0x${n.repeat(64).slice(0, 64)}` as Hash;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Mốc giờ cố định lúc tải trang, để hạn chót không bị đẩy lùi mỗi lần tải lại dữ liệu.
const T0 = Date.now();
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();


type MockPatch = Partial<DealOnchain> & {
  state: DealState;
  checkin?: boolean;
  checkout?: boolean;
  /** Có bộ ảnh "phòng không đúng mô tả" + báo cáo AI so với ảnh đăng tin. */
  mismatch?: boolean;
  /** Tiến độ AI so ảnh (chỉ có nghĩa khi checkout = true). Mặc định "done". */
  ai?: AiJobStatus | null;
  title: string;
};

/**
 * Báo cáo AI giả theo đúng schema kct.report.damage/1 (mẫu ở docs/model ai report/report.damage.json),
 * cho 3 vị trí của WALL_SAMPLE_TERMS: một hư hỏng mới có trong bảng giá, một hao mòn, một ảnh mờ.
 */
export function mockDamageReport(dealId: number): DamageReport {
  return {
    schema: "kct.report.damage/1",
    dealId,
    checkInHash: H("c"),
    checkOutHash: H("d"),
    model: "gemini-3.1-flash-lite",
    promptVersion: "damage-v1",
    createdAt: at(-600),
    positions: [
      {
        positionId: "p1",
        verdict: "NEW_DAMAGE",
        confidence: 0.86,
        description: "Ảnh trả phòng có một vết bẩn lớn ở góc phải mảng tường.",
        priceItemId: "i1",
        quantity: 1,
        outsidePriceList: false,
        amount: "16000000",
      },
      {
        positionId: "p2",
        verdict: "WEAR",
        confidence: 0.74,
        description: "Sơn cửa bạc màu đều, không thấy vết trầy mới.",
        priceItemId: null,
        quantity: 0,
        outsidePriceList: false,
        amount: "0",
      },
      {
        positionId: "p3",
        verdict: "UNCLEAR",
        confidence: 0.4,
        description: "Ảnh trả phòng bị mờ, không đủ rõ để so sánh.",
        priceItemId: null,
        quantity: 0,
        outsidePriceList: false,
        amount: "0",
      },
    ],
    totalAmount: "16000000",
    sealedAmount: "16000000",
  };
}

/** Báo cáo AI giả "phòng không đúng mô tả" theo schema kct.report.mismatch/1. */
export function mockMismatchReport(dealId: number): MismatchReport {
  return {
    schema: "kct.report.mismatch/1",
    dealId,
    termsHash: H("a"),
    evidenceHash: H("b"),
    model: "gemini-3.1-flash-lite",
    promptVersion: "listing-v1",
    createdAt: at(-300),
    verdict: "MISMATCH",
    confidence: 0.82,
    reasons: [
      "Tường đầu giường thực tế bị ố và bong sơn, ảnh đăng tin sạch.",
      "Cửa thực tế là cửa sắt, ảnh đăng tin là cửa gỗ.",
    ],
  };
}

export const MOCK_EXPLANATION =
  "Chỉ tường đầu giường có hư hỏng mới. Cửa chỉ cũ đi theo thời gian nên không tính. Ảnh sàn bị mờ nên AI không kết luận.";

const photoSet = (seed: string): PhotoSetView => ({
  setHash: H(seed),
  items: WALL_SAMPLE_TERMS.positions.map((p) => ({ positionId: p.id, url: "" })),
});

// Mỗi deal một trạng thái. Hạn chót tính bằng giây so với lúc tải trang (cột Demo trong contract-spec).
const MOCK_STATES: Record<number, MockPatch> = {
  21: { state: "RESERVED", deadline: at(180), title: "Đã cọc, chờ ảnh nhận phòng" },
  22: { state: "RESERVED", deadline: at(120), checkin: true, title: "Đã có ảnh nhận phòng" },
  23: { state: "ACTIVE", deadline: null, checkin: true, title: "Đang ở" },
  24: { state: "CHECKED_OUT", deadline: at(180), checkin: true, checkout: true, title: "Đã trả phòng" },
  25: {
    state: "PROPOSED",
    deadline: at(180),
    checkin: true,
    checkout: true,
    proposedAmount: "16000000",
    aiAmount: "16000000",
    hasAiSeal: true,
    title: "Chủ trọ đề xuất trừ 400.000 ₫",
  },
  26: {
    state: "DISPUTED",
    deadline: at(300),
    checkin: true,
    checkout: true,
    proposedAmount: "28000000",
    aiAmount: "16000000",
    counterAmount: "12000000",
    hasAiSeal: true,
    disputeKind: "DEDUCTION",
    votesTenant: 1, // phiếu AI: con số của người thuê gần aiAmount hơn
    title: "Đang phân xử mức trừ",
  },
  27: {
    state: "SETTLED",
    deadline: null,
    checkin: true,
    checkout: true,
    proposedAmount: "16000000",
    aiAmount: "16000000",
    hasAiSeal: true,
    title: "Đã chia tiền",
  },
  28: { state: "REFUNDED", deadline: null, title: "Đã hoàn cọc (không đến nhận phòng)" },
  29: { state: "CANCELLED", deadline: null, tenant: null, title: "Chủ trọ đã gỡ tin" },
  30: {
    state: "MISMATCH_REPORTED",
    deadline: at(120),
    mismatch: true,
    hasAiSeal: true,
    title: "Người thuê báo phòng sai mô tả",
  },
  31: { state: "ABANDON_REPORTED", deadline: at(120), checkin: true, title: "Chủ trọ báo người thuê bỏ đi" },
  32: {
    state: "PROPOSED",
    deadline: at(-60),
    checkin: true,
    checkout: true,
    proposedAmount: "16000000",
    aiAmount: "16000000",
    hasAiSeal: true,
    title: "Quá hạn trả lời (thử nút Xử lý quá hạn)",
  },
  33: {
    state: "CHECKED_OUT",
    deadline: at(240),
    checkin: true,
    checkout: true,
    ai: "processing",
    title: "Đã trả phòng, AI đang so ảnh",
  },
  34: {
    state: "CHECKED_OUT",
    deadline: at(180),
    checkin: true,
    checkout: true,
    ai: "failed",
    title: "Đã trả phòng, AI bị lỗi",
  },
  35: {
    state: "DISPUTED",
    deadline: at(300),
    mismatch: true,
    hasAiSeal: true,
    disputeKind: "MISMATCH",
    votesTenant: 1, // chủ trọ phản đối báo cáo "khác rõ": phiếu AI về người thuê
    title: "Đang phân xử phòng sai mô tả",
  },
  36: {
    state: "DISPUTED",
    deadline: at(-45),
    checkin: true,
    checkout: true,
    proposedAmount: "28000000",
    aiAmount: "16000000",
    counterAmount: "12000000",
    hasAiSeal: true,
    disputeKind: "DEDUCTION",
    votesTenant: 1,
    title: "Hết hạn bồi thẩm (thử nút Xử lý quá hạn)",
  },
};

/** Deal giả có AI chạy xong sau vài giây (deal 33), để thử màn chờ. */
export const MOCK_AI_READY_AT = T0 + 12_000;

/** Tiến độ AI của deal giả ở thời điểm hiện tại. */
export function mockAiStatus(dealId: number): AiJobStatus | null {
  const p = MOCK_STATES[dealId];
  if (!p?.checkout) return null;
  const ai = p.ai === undefined ? "done" : p.ai;
  return ai === "processing" && Date.now() > MOCK_AI_READY_AT ? "done" : ai;
}

/** Danh sách id deal giả, cho trang thử và màn "Hợp đồng của tôi" sau này. */
export const MOCK_DEAL_IDS = Object.keys(MOCK_STATES).map(Number);

function mockCanPoke(state: DealState, deadline: IsoTime | null): boolean {
  if (TERMINAL_STATES.includes(state) || deadline === null) return false;
  return Date.now() > Date.parse(deadline);
}

async function mockDealView(dealId: number): Promise<DealView> {
  const patch = MOCK_STATES[dealId];
  if (!patch) {
    // Phòng OPEN của màn danh sách (12–16): dùng lại dữ liệu giả sẵn có.
    const d = await fetchDeal(dealId);
    return base(d.dealId, d.terms, { state: d.onchain.state, tenant: d.onchain.tenant, deadline: null });
  }
  await delay(400);
  // `ai` không thuộc onchain: tách ra để không lọt vào DealOnchain (đọc lại bằng mockAiStatus bên dưới).
  const { title, checkin, checkout, mismatch, ai: aiPatch, ...onchain } = patch;
  void aiPatch;
  const terms: Terms = { ...WALL_SAMPLE_TERMS, room: { ...WALL_SAMPLE_TERMS.room, title } };
  const view = base(dealId, terms, { tenant: A("9"), ...onchain });
  if (checkin) view.photoSets.checkin = photoSet("c");
  if (checkout) view.photoSets.checkout = photoSet("d");
  if (mismatch) {
    view.photoSets.mismatch = { ...photoSet("b"), photoSetId: `ps_mock_mismatch_${dealId}` };
    view.reports.mismatch = mockMismatchReport(dealId);
    view.aiStatus.mismatch = "done";
  }
  const ai = mockAiStatus(dealId);
  view.aiStatus.damage = ai;
  if (ai === "done") {
    view.reports.damage = mockDamageReport(dealId);
    view.explanation = MOCK_EXPLANATION;
  }
  if (TERMINAL_STATES.includes(patch.state) && patch.state !== "CANCELLED") {
    view.history = [{ event: "Paid", txHash: H("f"), at: at(-120) }];
  }
  return view;
}

function base(dealId: number, terms: Terms, patch: Partial<DealOnchain> & { state: DealState }): DealView {
  const deadline = patch.deadline ?? null;
  return {
    dealId,
    onchain: {
      stateIndex: DEAL_STATES.indexOf(patch.state),
      landlord: terms.landlord,
      tenant: null,
      deposit: terms.money.depositAmount,
      reserveFee: terms.money.reserveFeeAmount,
      canPoke: mockCanPoke(patch.state, deadline),
      proposedAmount: "0",
      aiAmount: "0",
      counterAmount: "0",
      hasAiSeal: false,
      disputeKind: "NONE",
      votesLandlord: 0,
      votesTenant: 0,
      yieldOn: false,
      yieldGross: "0",
      ...patch,
      deadline,
    },
    terms,
    listingPhotoUrls: [],
    examplePhotoUrls: {},
    photoSets: { checkin: null, checkout: null, mismatch: null },
    reports: { damage: null, mismatch: null },
    aiStatus: { damage: null, mismatch: null },
    explanation: null,
    history: [],
  };
}

export { NotFoundError };
