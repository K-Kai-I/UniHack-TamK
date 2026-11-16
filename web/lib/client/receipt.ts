// Biên nhận cuối: ai nhận bao nhiêu. Số tiền lấy từ event `Paid` của contract, không lấy từ database:
//   event Paid(uint256 indexed id, Outcome outcome, uint256 toTenant, uint256 toLandlord, uint256 fee)
// `history` của GET /deals/:id chỉ có tên event + txHash (không có số tiền), nên frontend tìm dòng "Paid"
// trong history, đọc receipt của giao dịch đó qua RPC rồi giải mã log `Paid`.
import { isAddressEqual, parseEventLogs, type PublicClient } from "viem";
import { addresses, escrowAbi } from "@/lib/chain";
import type { Hash, IsoTime } from "@/lib/types";
import { DEALS_MOCK, type DealView } from "./deals-data";

/** Thứ tự giống enum Outcome trong contracts/src/IDepositEscrow.sol. */
export const OUTCOMES = ["NORMAL", "NO_SHOW", "MISMATCH", "ABANDONED", "LANDLORD_SILENT"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface PaidInfo {
  outcome: Outcome;
  toTenant: bigint;
  toLandlord: bigint;
  fee: bigint;
  txHash: Hash;
  at: IsoTime | null;
}

/**
 * null = chưa thấy event Paid trong history (server đọc log theo đoạn nên có thể chậm vài giây).
 * Ném lỗi khi không đọc được RPC.
 */
export async function fetchPaid(client: PublicClient | undefined, deal: DealView): Promise<PaidInfo | null> {
  const row = [...deal.history].reverse().find((h) => h.event === "Paid");
  if (!row) return null;
  if (DEALS_MOCK) return mockPaid(deal, row.txHash, row.at);
  if (!client) throw new Error("Chưa kết nối được mạng Fuji.");

  const receipt = await client.getTransactionReceipt({ hash: row.txHash });
  const logs = parseEventLogs({ abi: escrowAbi, eventName: "Paid", logs: receipt.logs });
  const log = logs.find(
    (l) => isAddressEqual(l.address, addresses.escrow) && l.args.id === BigInt(deal.dealId),
  );
  if (!log) return null;
  return {
    outcome: OUTCOMES[Number(log.args.outcome)] ?? "NORMAL",
    toTenant: log.args.toTenant,
    toLandlord: log.args.toLandlord,
    fee: log.args.fee,
    txHash: row.txHash,
    at: row.at,
  };
}

/** Bản giả: tính lại theo bảng Outcome trong contract-spec (lãi G = 0 nên phí F = 0). */
function mockPaid(deal: DealView, txHash: Hash, at: IsoTime): PaidInfo {
  const C = BigInt(deal.onchain.deposit);
  const R = BigInt(deal.onchain.reserveFee);
  if (deal.onchain.state === "REFUNDED") {
    return { outcome: "NO_SHOW", toTenant: C - R, toLandlord: R, fee: 0n, txHash, at };
  }
  const D = BigInt(deal.onchain.proposedAmount);
  return { outcome: "NORMAL", toTenant: C - D, toLandlord: D, fee: 0n, txHash, at };
}
