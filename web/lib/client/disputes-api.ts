// Bồi thẩm (docs/api-contract.md > GET /disputes?juror= và GET /disputes/:dealId, P1).
// Bằng chứng chỉ gồm các vị trí bị tranh chấp. Phiếu bầu đi thẳng lên contract bằng vote(id, side),
// server không ghi nhận phiếu (AGENTS.md luật 3, 4).
import type { Address, Amount, DamageVerdict, DealState, DisputeKind, IsoTime, ListingVerdict, PriceItem } from "@/lib/types";
import { apiFetch, ApiClientError } from "./api";
import { DEALS_MOCK, fetchDealView, mockDamageReport, mockMismatchReport, NotFoundError } from "./deals-data";

// TODO(spec): web/lib/types.ts chưa có kiểu response của 2 endpoint này. Khai báo tạm theo api-contract + route của Khải.
export interface JurorDisputeItem {
  dealId: number;
  title: string;
  kind: Exclude<DisputeKind, "NONE">;
  deadline: IsoTime;
  votes: { landlord: number; tenant: number };
}

export interface JurorDisputes {
  items: JurorDisputeItem[];
  isJuror: boolean;
}

export interface DisputeEvidence {
  positionId: string;
  name: string;
  /** DEDUCTION: ảnh nhận phòng. MISMATCH: ảnh ví dụ chủ trọ đăng. */
  beforeUrl: string | null;
  /** DEDUCTION: ảnh trả phòng. MISMATCH: ảnh người thuê chụp thực tế. */
  afterUrl: string | null;
  aiVerdict?: DamageVerdict | null;
  aiDescription?: string | null;
  aiAmount?: Amount | null;
}

export interface DisputeView {
  dealId: number;
  kind: DisputeKind;
  state: DealState;
  deadline: IsoTime | null;
  votes: { landlord: number; tenant: number };
  hasAiSeal: boolean;
  priceList: PriceItem[];
  evidence: DisputeEvidence[];
  /** DEDUCTION: con số của chủ trọ (D), người thuê (T) và AI. */
  landlordAmount?: Amount;
  tenantAmount?: Amount;
  aiAmount?: Amount;
  /** MISMATCH: kết luận AI so ảnh đăng tin với thực tế. */
  aiVerdict?: ListingVerdict | null;
  aiReasons?: string[];
}

/** Các vụ đang chờ phiếu mà ví này chưa bỏ. Ví không phải bồi thẩm: isJuror = false. */
export async function fetchJurorDisputes(juror: Address): Promise<JurorDisputes> {
  if (DEALS_MOCK) {
    await delay(300);
    const deals = await Promise.all([26, 35, 36].map((id) => fetchDealView(id)));
    return {
      isJuror: true,
      items: deals.map((d) => ({
        dealId: d.dealId,
        title: d.terms.room.title,
        kind: d.onchain.disputeKind === "MISMATCH" ? "MISMATCH" : "DEDUCTION",
        deadline: d.onchain.deadline!,
        votes: { landlord: d.onchain.votesLandlord, tenant: d.onchain.votesTenant },
      })),
    };
  }
  return apiFetch<JurorDisputes>(`/disputes?juror=${juror.toLowerCase()}`);
}

/** Bằng chứng một vụ. Deal chưa từng tranh chấp → WRONG_STATE; không có deal → NotFoundError. */
export async function fetchDispute(dealId: number): Promise<DisputeView> {
  if (DEALS_MOCK) return mockDispute(dealId);
  try {
    return await apiFetch<DisputeView>(`/disputes/${dealId}`);
  } catch (e) {
    if (e instanceof ApiClientError && e.code === "NOT_FOUND") throw new NotFoundError(e.message);
    throw e;
  }
}

// ------------------------------------------------------------------ bản giả

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mockDispute(dealId: number): Promise<DisputeView> {
  const d = await fetchDealView(dealId);
  const o = d.onchain;
  if (o.disputeKind === "NONE") throw new ApiClientError(409, "WRONG_STATE", "Hợp đồng này không có tranh chấp.");
  const base = {
    dealId,
    kind: o.disputeKind,
    state: o.state,
    deadline: o.deadline,
    votes: { landlord: o.votesLandlord, tenant: o.votesTenant },
    hasAiSeal: o.hasAiSeal,
    priceList: d.terms.priceList,
  };
  if (o.disputeKind === "MISMATCH") {
    const r = mockMismatchReport(dealId);
    return {
      ...base,
      aiVerdict: r.verdict,
      aiReasons: r.reasons,
      evidence: d.terms.positions.map((p) => ({ positionId: p.id, name: p.name, beforeUrl: null, afterUrl: null })),
    };
  }
  const report = mockDamageReport(dealId);
  return {
    ...base,
    landlordAmount: o.proposedAmount,
    tenantAmount: o.counterAmount,
    aiAmount: o.aiAmount,
    evidence: report.positions
      .filter((p) => p.verdict !== "NO_CHANGE")
      .map((p) => ({
        positionId: p.positionId,
        name: d.terms.positions.find((x) => x.id === p.positionId)?.name ?? p.positionId,
        beforeUrl: null,
        afterUrl: null,
        aiVerdict: p.verdict,
        aiDescription: p.description,
        aiAmount: p.amount,
      })),
  };
}
