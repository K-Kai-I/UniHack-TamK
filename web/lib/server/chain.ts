// Đọc chuỗi phía server. Trạng thái hợp đồng luôn lấy từ đây, không lấy từ database.
import "server-only";
import { createPublicClient, http, zeroAddress } from "viem";
import { addresses, chain, escrowAbi } from "../chain";
import { env } from "./env";
import { ApiErr } from "./http";
import { DEAL_STATES, DISPUTE_KINDS, type Address, type DealState } from "../types";

// batch: gom nhiều lệnh đọc trong cùng một nhịp thành 1 request JSON-RPC.
export const publicClient = createPublicClient({ chain, transport: http(env.fujiRpcUrl, { batch: true }) });
/** Client KHÔNG gom request, dành cho eth_getLogs: RPC Fuji tính giới hạn 100 khối trên cả gói gom chung,
 *  nên các đoạn đọc song song phải đi thành request HTTP riêng (xem events.ts). */
export const logsClient = createPublicClient({
  chain,
  // Mỗi lần hỏi tối đa 8 giây, thử lại 1 lần: RPC công khai chậm hay từ chối thì bỏ, lần sau đọc tiếp,
  // thay vì chờ-thử lại 3 lần (mặc định viem) làm keeper vượt giới hạn 60 giây của Vercel.
  transport: http(env.fujiRpcUrl, { timeout: 8_000, retryCount: 1 }),
});

function shape<T extends { state: number; landlord: string; tenant: string }>(deal: T) {
  return {
    ...deal,
    landlord: deal.landlord.toLowerCase() as Address,
    tenant: deal.tenant.toLowerCase() as Address,
    stateName: DEAL_STATES[deal.state] as DealState,
  };
}
export type OnchainDeal = Awaited<ReturnType<typeof readDeal>>;

export async function readDeal(dealId: bigint) {
  const deal = await publicClient.readContract({
    address: addresses.escrow,
    abi: escrowAbi,
    functionName: "getDeal",
    args: [dealId],
  });
  return shape(deal);
}

/** Như readDeal nhưng deal chưa tồn tại thì ném NOT_FOUND. */
export async function requireDeal(dealId: bigint) {
  const d = await readDeal(dealId);
  if (d.landlord === zeroAddress) throw new ApiErr("NOT_FOUND", `Không có hợp đồng #${dealId}`);
  return d;
}

export function requireState(d: OnchainDeal, ...states: DealState[]) {
  if (!states.includes(d.stateName)) {
    throw new ApiErr("WRONG_STATE", `Hợp đồng đang ở ${d.stateName}, cần ${states.join(" hoặc ")}`);
  }
}

/** Deal JSON cho API: số tiền thành chuỗi, deadline 0 thành null. */
export function onchainView(d: OnchainDeal, canPoke: boolean) {
  return {
    state: d.stateName,
    stateIndex: d.state,
    landlord: d.landlord,
    tenant: d.tenant === zeroAddress ? null : d.tenant,
    deposit: d.deposit.toString(),
    reserveFee: d.reserveFee.toString(),
    moveInDate: new Date(Number(d.moveInDate) * 1000).toISOString(),
    leaseEnd: new Date(Number(d.leaseEnd) * 1000).toISOString(),
    deadline: d.deadline === BigInt(0) ? null : new Date(Number(d.deadline) * 1000).toISOString(),
    canPoke,
    checkInHash: d.checkInHash,
    checkOutHash: d.checkOutHash,
    termsHash: d.termsHash,
    checkInContested: d.checkInContested,
    proposedAmount: d.proposedAmount.toString(),
    aiAmount: d.aiAmount.toString(),
    counterAmount: d.counterAmount.toString(),
    hasAiSeal: d.hasAiSeal,
    disputeKind: DISPUTE_KINDS[d.disputeKind],
    votesLandlord: d.votesLandlord,
    votesTenant: d.votesTenant,
    yieldEnabled: d.yieldEnabled,
    yieldOn: d.yieldOn,
    yieldGross: d.yieldGross.toString(),
  };
}

export async function readTimeouts() {
  const names = [
    "moveInGrace",
    "checkInObjection",
    "mismatchWindow",
    "abandonWindow",
    "checkOutGrace",
    "proposeWindow",
    "respondWindow",
    "juryWindow",
  ] as const;
  const values = await Promise.all(
    names.map((functionName) => publicClient.readContract({ address: addresses.escrow, abi: escrowAbi, functionName })),
  );
  return Object.fromEntries(names.map((n, i) => [n, Number(values[i])])) as Record<(typeof names)[number], number>;
}

export async function readCanPoke(dealId: bigint): Promise<boolean> {
  return publicClient.readContract({ address: addresses.escrow, abi: escrowAbi, functionName: "canPoke", args: [dealId] });
}

export async function readDealCount(): Promise<bigint> {
  return publicClient.readContract({ address: addresses.escrow, abi: escrowAbi, functionName: "dealCount" });
}

export async function readIsJuror(a: Address): Promise<boolean> {
  return publicClient.readContract({ address: addresses.escrow, abi: escrowAbi, functionName: "isJuror", args: [a] });
}

/** Đọc nhiều deal (các lệnh đọc được gom thành 1 request nhờ batch). */
export async function readDeals(ids: bigint[]) {
  const deals = await Promise.all(ids.map((id) => readDeal(id)));
  return deals.map((d, i) => ({ id: ids[i], ...d }));
}

export async function readCanPokeMany(ids: bigint[]): Promise<boolean[]> {
  return Promise.all(ids.map((id) => readCanPoke(id)));
}

export const FINAL_STATES: DealState[] = ["SETTLED", "REFUNDED", "CANCELLED"];
