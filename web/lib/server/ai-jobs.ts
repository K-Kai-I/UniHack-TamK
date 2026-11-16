// Chạy module AI (web/lib/ai) rồi tính tiền, hash báo cáo và ký con dấu EIP-712.
// Module AI chỉ so ảnh; tiền, hash, chữ ký đều làm ở đây (docs/api-contract.md > Module AI).
import "server-only";
import { compareDamage, compareListing, type PositionInput } from "../ai";
import { addresses } from "../chain";
import { hashJson } from "../hash";
import { sealDomain, sealTypes } from "../seal";
import {
  LISTING_VERDICT_CODE,
  type DamagePosition,
  type DamageReport,
  type DamageSeal,
  type Hash,
  type MismatchReport,
  type MismatchSeal,
} from "../types";
import type { OnchainDeal } from "./chain";
import { failAiReport, finishAiReport, type AiReportRow, type ListingRow, type PhotoSetRow } from "./repo";
import { photoDataUrl } from "./storage";
import { aiSignerAccount } from "./wallets";

const CHAIN_ID = 43113;

/** So từng vị trí song song (mỗi vị trí 1 lần gọi AI) để không vượt giới hạn thời gian của hàm. */
async function comparePositions(positions: PositionInput[], listing: ListingRow) {
  const results = await Promise.all(
    positions.map((p) => compareDamage({ positions: [p], priceList: listing.terms.priceList })),
  );
  return {
    model: results[0].model,
    promptVersion: results[0].promptVersion,
    positions: results.flatMap((r) => r.positions),
  };
}

export async function runDamageJob(
  row: AiReportRow,
  deal: OnchainDeal,
  dealId: bigint,
  listing: ListingRow,
  checkin: PhotoSetRow,
  checkout: PhotoSetRow,
): Promise<void> {
  try {
    const inputs: PositionInput[] = await Promise.all(
      listing.terms.positions.map(async (p) => ({
        positionId: p.id,
        name: p.name,
        beforeUrl: await photoDataUrl(checkin.photo_ids[p.id]),
        afterUrl: await photoDataUrl(checkout.photo_ids[p.id]),
      })),
    );
    const ai = await comparePositions(inputs, listing);

    // API tự nhân đơn giá; AI chỉ chọn kết luận, hạng mục và số lượng.
    const prices = new Map(listing.terms.priceList.map((i) => [i.id, BigInt(i.priceAmount)]));
    const positions: DamagePosition[] = ai.positions.map((p) => {
      const verdict = p.confidence < 0.6 ? "UNCLEAR" : p.verdict;
      const priced = verdict === "NEW_DAMAGE" && !p.outsidePriceList && p.priceItemId && prices.has(p.priceItemId);
      const amount = priced ? prices.get(p.priceItemId!)! * BigInt(Math.max(0, Math.floor(p.quantity))) : BigInt(0);
      return { ...p, verdict, amount: amount.toString() };
    });
    const total = positions.reduce((s, p) => s + BigInt(p.amount), BigInt(0));
    const sealed = total < deal.deposit ? total : deal.deposit;

    const report: DamageReport = {
      schema: "kct.report.damage/1",
      dealId: Number(dealId),
      checkInHash: deal.checkInHash,
      checkOutHash: deal.checkOutHash,
      model: ai.model,
      promptVersion: ai.promptVersion,
      createdAt: new Date().toISOString(),
      positions,
      totalAmount: total.toString(),
      sealedAmount: sealed.toString(),
    };
    const reportHash = hashJson(report);
    const signature = await aiSignerAccount().signTypedData({
      domain: sealDomain(CHAIN_ID, addresses.escrow),
      types: sealTypes,
      primaryType: "DamageReport",
      message: { dealId, checkInHash: deal.checkInHash, checkOutHash: deal.checkOutHash, aiAmount: sealed, reportHash },
    });
    await finishAiReport(row.id, { report, reportHash, sealedAmount: sealed.toString(), signature });
  } catch (e) {
    console.error("[ai/damage]", e);
    await failAiReport(row.id, (e as Error).message ?? "AI lỗi");
  }
}

export async function runMismatchJob(
  row: AiReportRow,
  deal: OnchainDeal,
  dealId: bigint,
  listing: ListingRow,
  evidence: PhotoSetRow,
): Promise<void> {
  try {
    // "Trước" là ảnh ví dụ chủ trọ chụp lúc đăng tin cho từng vị trí; "sau" là ảnh người thuê chụp thực tế.
    const inputs: PositionInput[] = await Promise.all(
      listing.terms.positions.map(async (p) => ({
        positionId: p.id,
        name: p.name,
        beforeUrl: await photoDataUrl(p.examplePhoto.photoId),
        afterUrl: await photoDataUrl(evidence.photo_ids[p.id]),
      })),
    );
    const ai = await compareListing({ positions: inputs });
    const evidenceHash = evidence.set_hash as Hash;
    const report: MismatchReport = {
      schema: "kct.report.mismatch/1",
      dealId: Number(dealId),
      termsHash: deal.termsHash,
      evidenceHash,
      model: ai.model,
      promptVersion: ai.promptVersion,
      createdAt: new Date().toISOString(),
      verdict: ai.verdict,
      confidence: ai.confidence,
      reasons: ai.reasons,
    };
    const verdict = LISTING_VERDICT_CODE[ai.verdict];
    const reportHash = hashJson(report);
    const signature = await aiSignerAccount().signTypedData({
      domain: sealDomain(CHAIN_ID, addresses.escrow),
      types: sealTypes,
      primaryType: "MismatchReport",
      message: { dealId, termsHash: deal.termsHash, evidenceHash, verdict, reportHash },
    });
    await finishAiReport(row.id, { report, reportHash, verdict, signature });
  } catch (e) {
    console.error("[ai/mismatch]", e);
    await failAiReport(row.id, (e as Error).message ?? "AI lỗi");
  }
}

/** Dạng trả về của GET /deals/:id/ai/damage. */
export function damageResponse(row: AiReportRow | null, deal: OnchainDeal, dealId: bigint) {
  if (!row) return { status: "none" as const, report: null, seal: null };
  if (row.status !== "done") return { status: row.status, report: null, seal: null, error: row.error ?? undefined };
  const report = row.report as DamageReport;
  const seal: DamageSeal = {
    dealId: Number(dealId),
    checkInHash: report.checkInHash ?? deal.checkInHash,
    checkOutHash: report.checkOutHash ?? deal.checkOutHash,
    aiAmount: row.sealed_amount ?? "0",
    reportHash: row.report_hash as Hash,
    signature: row.signature as Hash,
    signer: aiSignerAccount().address.toLowerCase() as Hash,
  };
  return { status: "done" as const, report, seal };
}

export function mismatchResponse(row: AiReportRow | null, dealId: bigint) {
  if (!row) return { status: "none" as const, report: null, seal: null };
  if (row.status !== "done") return { status: row.status, report: null, seal: null, error: row.error ?? undefined };
  const report = row.report as MismatchReport;
  const seal: MismatchSeal & { signer: string } = {
    dealId: Number(dealId),
    termsHash: report.termsHash,
    evidenceHash: report.evidenceHash,
    verdict: (row.verdict ?? 1) as 0 | 1 | 2,
    reportHash: row.report_hash as Hash,
    signature: row.signature as Hash,
    signer: aiSignerAccount().address.toLowerCase(),
  };
  return { status: "done" as const, report, seal };
}
